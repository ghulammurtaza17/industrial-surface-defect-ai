import os
import io
import json
from app import app
import numpy as np
from PIL import Image

client = app.test_client()

print('--- Testing Health ---')
resp = client.get('/health')
print(f"Status: {resp.status_code}, JSON: {resp.json}")

print('\n--- Testing Empty Upload ---')
resp = client.post('/predict', data={})
print(f"Status: {resp.status_code}, JSON: {resp.json}")

print('\n--- Testing Empty Filename ---')
data = {'file': (io.BytesIO(b''), '')}
resp = client.post('/predict', data=data, content_type='multipart/form-data')
print(f"Status: {resp.status_code}, JSON: {resp.json}")

print('\n--- Testing Invalid File Extension ---')
data = {'file': (io.BytesIO(b'dummy text'), 'test.txt')}
resp = client.post('/predict', data=data, content_type='multipart/form-data')
print(f"Status: {resp.status_code}, JSON: {resp.json}")

print('\n--- Testing Valid Image Predictions ---')
for i in range(6):
    img_array = np.random.randint(0, 255, (200, 200, 3), dtype=np.uint8)
    img = Image.fromarray(img_array)
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    buf.seek(0)
    data = {'file': (buf, f'test_{i}.jpg')}
    resp = client.post('/predict', data=data, content_type='multipart/form-data')
    print(f'Test {i}: Status {resp.status_code}')
    if resp.json:
        print(f"Prediction: {resp.json.get('prediction')}, Top 3: {[x['class'] for x in resp.json.get('top_3', [])]}")