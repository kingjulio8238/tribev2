# TRIBE v2 Production API

FastAPI server that accepts video uploads, runs the TRIBE v2 brain prediction pipeline, and returns shareable viewer URLs.

## Quick Start (Local)

```bash
# From the repo root
pip install -e ".[plotting]"
pip install -r api/requirements.txt

# Set R2 credentials for sharing
export R2_ACCOUNT_ID="..."
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
export R2_BUCKET_NAME="tribe-viewer-data"
export R2_PUBLIC_URL="https://pub-xxx.r2.dev"

# Optional: set Groq key for emotion + report analysis
export GROQ_API_KEY="gsk_..."

# Start the server
uvicorn api.server:app --host 0.0.0.0 --port 8000
```

Models load at startup (~30s). First request with a new video takes ~4-5 min on A100.

## API Endpoints

### POST /api/process

Upload a video and start processing.

```bash
curl -X POST http://localhost:8000/api/process \
  -F "video=@my_video.mp4" \
  -F "title=My Ad" \
  -F "objective=Drive brand awareness" \
  -F "target_audience=18-35 adults" \
  -F "intended_emotions=Excitement,Joy" \
  -F "groq_api_key=gsk_..."
```

Response:
```json
{"job_id": "abc123def456", "status": "queued"}
```

### GET /api/jobs/{job_id}

Poll job status.

```bash
curl http://localhost:8000/api/jobs/abc123def456
```

Response (processing):
```json
{"job_id": "abc123def456", "status": "processing", "progress": 0.45, "stage": "extracting_video"}
```

Response (complete):
```json
{
  "job_id": "abc123def456",
  "status": "complete",
  "share_url": "https://viewer.vercel.app/?demo=abc123def456",
  "report": {"overallScore": 78, "summary": "..."}
}
```

### GET /health

```bash
curl http://localhost:8000/health
```

## Docker Deployment

```bash
docker build -t tribe-api -f api/Dockerfile .
docker run --gpus all -p 8000:8000 \
  -e R2_ACCOUNT_ID=... \
  -e R2_ACCESS_KEY_ID=... \
  -e R2_SECRET_ACCESS_KEY=... \
  -e R2_BUCKET_NAME=tribe-viewer-data \
  -e R2_PUBLIC_URL=https://pub-xxx.r2.dev \
  tribe-api
```

## Cloud Deployment

### RunPod
1. Create a GPU pod (A100 recommended)
2. Use the Docker image or install from source
3. Set environment variables
4. Expose port 8000

### Modal
```python
import modal
app = modal.App("tribe-api")

@app.function(gpu="A100", image=modal.Image.from_dockerfile("api/Dockerfile"))
@modal.asgi_app()
def serve():
    from api.server import app
    return app
```

## Performance

| Metric | Value |
|---|---|
| Model load (cold start) | ~30s |
| Processing (52s video, A100) | ~4.5 min |
| Processing (52s video, T4) | ~6.5 min |
| Concurrent requests | 1 per GPU (queued) |
| GPU memory | ~8.6 GB peak |
