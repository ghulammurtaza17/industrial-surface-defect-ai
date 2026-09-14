# SteelSight AI

SteelSight AI is a premium, production-ready web application for real-time industrial surface defect detection. Built with a Flask backend and a highly polished glassmorphism frontend dashboard, this tool runs inference on high-resolution steel images using a robust TensorFlow/Keras neural network. 

## Features
- **Six-Class Defect Detection:** Classifies crazing, inclusion, patches, pitted surface, rolled-in scale, and scratches.
- **Premium Industrial Dashboard:** A dark/light themed, responsive, 2-column UI tailored for engineering and manufacturing operations.
- **Explainable AI:** Provides side-by-side original and Grad-CAM visualizations to interpret exactly *where* the model is looking.
- **Automated Reporting:** Generates downloadable JSON metadata files and cleanly formatted PDF inspection reports via a custom print stylesheet.
- **Actionable Insights:** Maps predicted defect classes to real-world engineering troubleshooting recommendations.
- **Session History:** Stateful logging of all inspections conducted during the active session.

## Architecture & Stack
- **Frontend:** Pure HTML5, CSS3 (Variables, Grid, Flexbox, Glassmorphism, CSS Animations), Vanilla JavaScript (No React/Vue required).
- **Backend:** Python 3, Flask, Gunicorn.
- **Machine Learning:** TensorFlow/Keras (using `tensorflow-cpu` for optimized, cost-effective server deployments), OpenCV, Pillow, NumPy.

---

## Deployment (Render & GitHub)

This repository is pre-configured for instant deployment on [Render](https://render.com) (or Heroku).

1. **Fork or Push** this repository to your GitHub account.
2. **Log into Render** and create a new **Web Service**.
3. **Connect** your GitHub repository.
4. **Configuration settings:**
   - **Environment:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn --workers 1 --threads 2 --timeout 120 app:app`
   - **Instance Type:** Free or Starter (the `tensorflow-cpu` package drastically reduces memory overhead, allowing it to run smoothly on lower-tier instances).
5. **Deploy!** The `Procfile` and `requirements.txt` are exactly configured to handle the ML dependencies without exhausting memory limits.

## Local Development Setup

To run this application locally for development or testing:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/steelsight-ai.git
   cd steelsight-ai
   ```

2. **Create a virtual environment:**
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the Flask server:**
   ```bash
   python app.py
   ```

5. **Open your browser:**
   Navigate to `http://127.0.0.1:5000/`

## API Endpoints

The Flask application serves a RESTful JSON API that the frontend consumes:

### `GET /health`
Returns the operational status of the server and model.
```json
{
  "status": "healthy",
  "model_loaded": true,
  "supported_classes": 6
}
```

### `POST /predict`
Expects `multipart/form-data` with an image file attached to the `file` key.
Returns defect predictions, confidence scores, and base64-encoded Grad-CAM visuals.

## License
MIT License.
