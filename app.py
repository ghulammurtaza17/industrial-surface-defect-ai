import os

# Set CUDA_VISIBLE_DEVICES=-1 before importing TensorFlow to completely disable GPU
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'

import io
import json
import base64
import logging
import gc
import traceback
from flask import Flask, request, jsonify, render_template
from werkzeug.exceptions import HTTPException
from PIL import Image
import numpy as np

import tensorflow as tf

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure TensorFlow for extreme low memory environments
tf.config.threading.set_inter_op_parallelism_threads(1)
tf.config.threading.set_intra_op_parallelism_threads(1)

app = Flask(__name__)

# Allowed file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

# Model configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'surface_defect_model.keras')
METADATA_PATH = os.path.join(BASE_DIR, 'model', 'model_metadata.json')

model = None
metadata = {}
class_names = []
class_to_index = {}
input_size = (200, 200)

def load_model_and_metadata():
    global model, metadata, class_names, class_to_index, input_size
    try:
        if os.path.exists(METADATA_PATH):
            with open(METADATA_PATH, 'r') as f:
                metadata = json.load(f)
                class_names = metadata.get('class_names', [])
                class_to_index = metadata.get('class_to_index', {})
                input_size = tuple(metadata.get('input_size', [200, 200])[:2])
                logger.info(f"Loaded metadata from {METADATA_PATH}")
        else:
            logger.error(f"Metadata file not found at {METADATA_PATH}")

        if os.path.exists(MODEL_PATH):
            model = tf.keras.models.load_model(MODEL_PATH)
            logger.info(f"Loaded model from {MODEL_PATH}")
        else:
            logger.error(f"Model file not found at {MODEL_PATH}")
            
    except Exception as e:
        logger.error(f"Error loading model or metadata: {traceback.format_exc()}")

# Load model when module is loaded
load_model_and_metadata()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def find_last_conv_layer(model):
    """Finds the last convolutional layer in a Keras model dynamically."""
    for layer in reversed(model.layers):
        try:
            if hasattr(layer, 'output_shape') and isinstance(layer.output_shape, tuple):
                if len(layer.output_shape) == 4 and 'conv' in layer.name.lower():
                    return layer.name
        except Exception:
            pass
            
    for layer in reversed(model.layers):
        try:
            if hasattr(layer, 'output_shape') and isinstance(layer.output_shape, tuple):
                if len(layer.output_shape) == 4:
                    return layer.name
        except Exception:
            pass
    return None

def make_gradcam_heatmap(img_array, model, last_conv_layer_name, pred_index=None):
    grad_model = tf.keras.models.Model(
        model.inputs, 
        [model.get_layer(last_conv_layer_name).output, model.output]
    )
    
    with tf.GradientTape() as tape:
        last_conv_layer_output, preds = grad_model(img_array)
        if pred_index is None:
            pred_index = tf.argmax(preds[0])
        class_channel = preds[:, pred_index]

    grads = tape.gradient(class_channel, last_conv_layer_output)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
    
    last_conv_layer_output = last_conv_layer_output[0]
    heatmap = last_conv_layer_output @ pooled_grads[..., tf.newaxis]
    heatmap = tf.squeeze(heatmap)
    heatmap = tf.maximum(heatmap, 0) / tf.math.reduce_max(heatmap)
    return heatmap.numpy()

def overlay_gradcam(img_array, heatmap, alpha=0.4):
    import cv2 # Local import so it doesn't crash the app globally if uninstalled
    heatmap = np.uint8(255 * heatmap)
    jet = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
    jet = cv2.cvtColor(jet, cv2.COLOR_BGR2RGB)
    jet = cv2.resize(jet, (img_array.shape[1], img_array.shape[0]))
    
    superimposed_img = jet * alpha + img_array
    superimposed_img = np.clip(superimposed_img, 0, 255).astype(np.uint8)
    return superimposed_img

def encode_image_base64(img_array):
    pil_img = Image.fromarray(img_array)
    buff = io.BytesIO()
    pil_img.save(buff, format="JPEG")
    img_str = base64.b64encode(buff.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{img_str}"

@app.errorhandler(HTTPException)
def handle_exception(e):
    return jsonify({
        "error": e.description,
        "code": e.code
    }), e.code

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/health', methods=['GET'])
def health():
    status = {
        'status': 'healthy',
        'model_loaded': model is not None,
        'class_names': class_names
    }
    return jsonify(status), 200

@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({'error': 'Model not loaded on server'}), 500
        
    if 'file' not in request.files:
        return jsonify({'error': 'No file part in the request'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Only PNG, JPG, and JPEG are allowed.'}), 400

    try:
        image_bytes = file.read()
        if len(image_bytes) > 10 * 1024 * 1024:
            return jsonify({'error': 'File size exceeds 10MB limit'}), 400
        pil_image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    except Exception as e:
        logger.error(f"Error reading image: {traceback.format_exc()}")
        return jsonify({'error': 'Invalid or corrupted image'}), 400
        
    try:
        original_img_array = np.array(pil_image)
        resized_img = pil_image.resize(input_size)
        img_array = np.array(resized_img, dtype=np.float32) / 255.0
        img_array_batch = np.expand_dims(img_array, axis=0)
        
        predictions = model.predict(img_array_batch, verbose=0)[0]
        
        top_indices = np.argsort(predictions)[::-1]
        
        top_3 = []
        for i in range(3):
            idx = top_indices[i]
            top_3.append({
                'class': class_names[idx] if idx < len(class_names) else f'Class {idx}',
                'confidence': float(predictions[idx]) * 100
            })
            
        pred_idx = top_indices[0]
        pred_class = class_names[pred_idx] if pred_idx < len(class_names) else f'Class {pred_idx}'
        pred_conf = float(predictions[pred_idx]) * 100
        
        if pred_conf >= 90.0:
            conf_status = "High Confidence"
        elif pred_conf >= 70.0:
            conf_status = "Moderate Confidence"
        else:
            conf_status = "Low Confidence"
            
        response_data = {
            'prediction': pred_class,
            'confidence': pred_conf,
            'confidence_status': conf_status,
            'top_3': top_3
        }
        
        try:
            last_conv_layer = find_last_conv_layer(model)
            if last_conv_layer:
                heatmap = make_gradcam_heatmap(img_array_batch, model, last_conv_layer, pred_idx)
                overlay = overlay_gradcam(original_img_array, heatmap)
                base64_cam = encode_image_base64(overlay)
                response_data['gradcam_image'] = base64_cam
            else:
                response_data['gradcam_error'] = "Could not locate final convolutional layer for Grad-CAM."
        except Exception as e:
            logger.error(f"Grad-CAM generation failed: {traceback.format_exc()}")
            response_data['gradcam_error'] = f"Grad-CAM visualization unavailable: {str(e)}"
        
        # EXTREME MEMORY CLEANUP
        del pil_image
        del resized_img
        del img_array
        del img_array_batch
        del original_img_array
        if 'heatmap' in locals(): del heatmap
        if 'overlay' in locals(): del overlay
        
        gc.collect()
        
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Error during prediction: {traceback.format_exc()}")
        # Fallback memory cleanup on error
        gc.collect()
        return jsonify({'error': 'An internal error occurred during prediction.'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
