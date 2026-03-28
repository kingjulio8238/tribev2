# Production API — Multiple Video Processing

## Overview

A FastAPI service that keeps all models warm in GPU memory, accepts video uploads, processes them through the TRIBE v2 pipeline, and serves results to the viewer.

## Architecture

### Persistent Model Loading

Single process loads all models once at startup and keeps them in VRAM:
- TRIBE v2 brain model (~710 MB)
- V-JEPA2 encoder (~2 GB in BF16) — loaded on first request, kept warm
- LLaMA 3.2-3B (~3.2 GB in BF16)
- Wav2Vec-BERT (~1.2 GB)
- faster-whisper large-v3 (~1.5 GB)

Total VRAM: ~8.6 GB — fits comfortably on A100 (40 GB), even leaves room for batching.

Estimated speedup from warm models: ~20s saved per request (no model loading), bringing 4.7 min → ~4.4 min.

### Async Job Queue

Video processing takes minutes, so use async request/response:
```
POST /api/predict  →  { "job_id": "abc123", "status": "queued" }
GET  /api/jobs/abc123  →  { "status": "processing", "progress": 0.45 }
GET  /api/jobs/abc123  →  { "status": "complete", "result_url": "/data/abc123/" }
```

Backend options: Redis + Celery, or simple in-memory queue for single-GPU.

## File Structure

```
api/
├── server.py              # FastAPI app + routes
├── worker.py              # GPU processing worker
├── models.py              # Model manager (load once, reuse)
├── pipeline.py            # Optimized pipeline (from notebook)
├── Dockerfile             # A100-ready container
└── requirements.txt
```

## Model Manager (Singleton)

```python
class ModelManager:
    """Loads all models once, keeps them in GPU memory."""

    def __init__(self, device="cuda"):
        self.tribe_model = TribeModel.from_pretrained(...)
        self.whisper = WhisperModel("large-v3", device=device)
        # Apply all v5 optimizations at init

    def predict(self, video_path: Path) -> dict:
        # Reuses warm models — no loading overhead
        events = self._build_events(video_path)  # uses self.whisper
        preds, segments = self.tribe_model.predict(events)
        return self._export(preds, segments)
```

## API Routes

```
POST /api/predict          Upload video → start job → return job_id
GET  /api/jobs/{id}        Poll job status + progress
GET  /api/jobs/{id}/result Download result zip or serve viewer data
GET  /data/{id}/...        Static file serving for viewer
DELETE /api/jobs/{id}      Cleanup old results
```

## Viewer Integration

The existing viewer at `viewer/` already loads data from `/data/`. For multi-video:
- Each job gets a unique data directory: `/data/{job_id}/`
- Viewer URL becomes: `/?demo={job_id}`
- Landing page shows upload form + gallery of processed videos

## Deployment

```dockerfile
FROM nvidia/cuda:12.4-runtime
# Pre-download all model weights at build time
# Pre-generate fsaverage5 mesh
# Single GPU, single worker process
```

Deploy on: RunPod, Modal, AWS (p4d.xlarge), GCP (a2-highgpu-1g), or self-hosted A100.

## Scaling

| Approach | Throughput | Complexity |
|---|---|---|
| Single A100, sequential | 1 video / 4.7 min | Low |
| Single A100, pipeline overlap | ~1 video / 3.5 min | Medium |
| Multi-GPU (2-4x A100) | 2-4 videos / 4.7 min | Medium |
| Serverless (Modal/RunPod) | Auto-scale, pay-per-use | Low |

## Expected Production Performance

| Metric | Value |
|---|---|
| First request (cold start) | ~5 min (model loading + inference) |
| Subsequent requests (warm) | ~4.4 min per 52s video |
| Max video length | ~5 min (limited by GPU memory for features) |
| Concurrent requests | Queue-based, 1 at a time per GPU |
| Cost per video (A100 spot) | ~$0.15-0.25 |

## Implementation Order

1. `api/models.py` — Model manager with warm loading
2. `api/pipeline.py` — Optimized pipeline (port notebook logic)
3. `api/server.py` — FastAPI with upload + job queue
4. `api/Dockerfile` — Container with pre-downloaded weights
5. Viewer updates — upload form, multi-demo support
6. Deploy to cloud GPU
