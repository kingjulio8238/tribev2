# GPU Testing Guide

How to test the production API on a GPU machine.

## Option 1: RunPod (Recommended)

### Setup

1. Go to [runpod.io](https://www.runpod.io/) and create an account
2. Deploy a GPU pod:
   - Template: **RunPod PyTorch 2.1** (or any CUDA 12.x image)
   - GPU: **A100 40GB** ($1.64/hr community, $3.29/hr secure)
   - Disk: **50 GB** (for model weights + video processing)
3. Connect via SSH or web terminal

### Install & Run

```bash
# Clone repo
git clone https://github.com/kingjulio8238/tribev2.git
cd tribev2

# Install
pip install -e ".[plotting]"
pip install -r api/requirements.txt

# Set R2 credentials
export R2_ACCOUNT_ID="ef04806e1551040683858a996e9ec642"
export R2_ACCESS_KEY_ID="your-key"
export R2_SECRET_ACCESS_KEY="your-secret"
export R2_BUCKET_NAME="tribe-viewer-data"
export R2_PUBLIC_URL="https://pub-229ab6015b7c479eb50adf6c065a5e51.r2.dev"

# Authenticate HuggingFace (needed for LLaMA 3.2-3B)
huggingface-cli login

# Start server
uvicorn api.server:app --host 0.0.0.0 --port 8000
```

Server loads models in ~30s. Health check: `curl http://localhost:8000/health`

### Test

```bash
# Upload a video
curl -X POST http://localhost:8000/api/process \
  -F "video=@my_video.mp4" \
  -F "title=My Ad" \
  -F "objective=Drive brand awareness" \
  -F "target_audience=18-35 adults" \
  -F "intended_emotions=Excitement,Joy" \
  -F "groq_api_key=gsk_..."

# Poll status (replace JOB_ID)
curl http://localhost:8000/api/jobs/JOB_ID

# Expected: ~4.5 min for a 52s video on A100
```

## Option 2: Google Colab (Quick Test)

Run the API directly in a Colab notebook cell:

```python
# In a Colab notebook with GPU runtime
!pip install "tribev2[plotting] @ git+https://github.com/kingjulio8238/tribev2.git" -q
!pip install fastapi uvicorn python-multipart boto3 faster-whisper -q
!pip install "numpy==2.1.0" -q

# Restart runtime, then:
import threading
from api.server import app
import uvicorn

# Start server in background
threading.Thread(
    target=uvicorn.run,
    args=(app,),
    kwargs={"host": "0.0.0.0", "port": 8000},
    daemon=True,
).start()

# Install ngrok for public URL
!pip install pyngrok -q
from pyngrok import ngrok
public_url = ngrok.connect(8000)
print(f"API available at: {public_url}")
```

Then test from your local machine using the ngrok URL.

## Option 3: Docker

```bash
# Build
docker build -t tribe-api -f api/Dockerfile .

# Run
docker run --gpus all -p 8000:8000 \
  -e R2_ACCOUNT_ID=... \
  -e R2_ACCESS_KEY_ID=... \
  -e R2_SECRET_ACCESS_KEY=... \
  -e R2_BUCKET_NAME=tribe-viewer-data \
  -e R2_PUBLIC_URL=https://pub-xxx.r2.dev \
  -e HF_TOKEN=your-huggingface-token \
  tribe-api
```

## Option 4: Modal (Serverless)

```bash
pip install modal
modal setup  # one-time auth

# Deploy
modal deploy api/modal_app.py
```

## Testing Checklist

```bash
# 1. Health check
curl http://HOST:8000/health
# Expected: {"status": "ready", "gpu": "NVIDIA A100-SXM4-40GB", ...}

# 2. Upload video
JOB=$(curl -s -X POST http://HOST:8000/api/process \
  -F "video=@video.mp4" \
  -F "title=Test" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")

# 3. Poll until complete
watch -n 5 "curl -s http://HOST:8000/api/jobs/$JOB | python3 -m json.tool"

# 4. Verify share URL works
# The response will contain share_url — open it in a browser

# 5. Test file validation
curl -X POST http://HOST:8000/api/process -F "video=@file.txt"
# Expected: 400 Bad Request

# 6. Test concurrent requests (should queue, not crash)
curl -X POST http://HOST:8000/api/process -F "video=@video1.mp4" &
curl -X POST http://HOST:8000/api/process -F "video=@video2.mp4" &
# Second job should show "queued" stage while first processes
```

## Expected Performance

| GPU | Model Load | 52s Video | Total |
|---|---|---|---|
| T4 (16 GB) | ~30s | ~6.5 min | ~7 min |
| A100 (40 GB) | ~30s | ~4.5 min | ~5 min |
| H100 (80 GB) | ~30s | ~2.5 min (est.) | ~3 min |
