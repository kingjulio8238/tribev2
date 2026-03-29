"""FastAPI server for TRIBE v2 brain prediction pipeline.

Accepts video uploads, processes them asynchronously, and returns
shareable viewer URLs with brain activations and analysis.

Usage::

    uvicorn api.server:app --host 0.0.0.0 --port 8000
"""

import logging
import os
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB
ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mkv", ".mov", ".webm"}

logger = logging.getLogger(__name__)

# Only one pipeline job can run at a time (GPU mutual exclusion)
_pipeline_semaphore = threading.Semaphore(1)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# ---------------------------------------------------------------------------
#  Job store
# ---------------------------------------------------------------------------

class Job(BaseModel):
    job_id: str
    status: str = "queued"  # queued → processing → complete → error
    progress: float = 0.0
    stage: str = ""
    share_url: str | None = None
    report: dict[str, Any] | None = None
    error: str | None = None
    created_at: float = 0.0
    completed_at: float | None = None

_jobs: dict[str, Job] = {}
_jobs_lock = threading.Lock()

# ---------------------------------------------------------------------------
#  FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="TRIBE v2 API",
    description="Brain prediction pipeline for video analysis",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
#  Startup: load models
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup():
    """Load models into GPU memory at server start."""
    logger.info("Loading models (this takes ~30s on first run)...")
    threading.Thread(target=_load_models, daemon=True).start()

_startup_error: str | None = None

def _load_models():
    global _startup_error
    try:
        from api.models import ModelManager
        ModelManager.get()
        logger.info("Models loaded and ready.")
    except Exception as e:
        _startup_error = str(e)
        logger.error("Failed to load models: %s", e)

# ---------------------------------------------------------------------------
#  Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Health check — reports model status and GPU info."""
    from api.models import ModelManager
    loaded = ModelManager.is_loaded()
    if _startup_error:
        return JSONResponse(status_code=500, content={"status": "error", "error": _startup_error})
    info = {"status": "ready" if loaded else "loading"}
    if loaded:
        mgr = ModelManager.get()
        info["gpu"] = mgr.opt_info.get("gpu_name", "unknown")
        info["device"] = mgr.get_device()
    return info


@app.post("/api/process")
async def process_video(
    video: UploadFile = File(...),
    title: str = Form(""),
    objective: str = Form(""),
    target_audience: str = Form(""),
    intended_emotions: str = Form(""),  # comma-separated
    key_moments: str = Form(""),
    success_criteria: str = Form(""),
    groq_api_key: str = Form(""),
):
    """Upload a video and start processing. Returns a job ID for polling."""
    from api.models import ModelManager
    if not ModelManager.is_loaded():
        return JSONResponse(status_code=503, content={"error": "Models still loading. Try again shortly."})

    # Validate file extension
    safe_name = Path(video.filename).name if video.filename else "upload.mp4"
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    # Save uploaded video with size limit
    job_id = uuid.uuid4().hex[:12]
    upload_dir = Path(f"./uploads/{job_id}")
    upload_dir.mkdir(parents=True, exist_ok=True)
    video_path = upload_dir / safe_name

    size = 0
    with open(video_path, "wb") as f:
        while chunk := video.file.read(1024 * 1024):  # 1MB chunks
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                f.close()
                shutil.rmtree(upload_dir, ignore_errors=True)
                raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_UPLOAD_BYTES // (1024*1024)} MB.")

    # Build brief
    brief = None
    if title:
        brief = {
            "title": title,
            "objective": objective,
            "target_audience": target_audience,
            "intended_emotions": [e.strip() for e in intended_emotions.split(",") if e.strip()],
            "key_moments": key_moments,
            "success_criteria": success_criteria,
        }

    # Create job
    job = Job(job_id=job_id, created_at=time.time())
    with _jobs_lock:
        _jobs[job_id] = job

    # Start processing in background
    threading.Thread(
        target=_process_job,
        args=(job_id, str(video_path), brief, groq_api_key or None),
        daemon=True,
    ).start()

    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    """Get the status of a processing job."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        return JSONResponse(status_code=404, content={"error": "Job not found"})
    return job.model_dump()


# ---------------------------------------------------------------------------
#  Background worker
# ---------------------------------------------------------------------------

def _process_job(job_id: str, video_path: str, brief: dict | None, groq_api_key: str | None):
    """Run the pipeline in a background thread."""
    from api.pipeline import run_pipeline

    def on_progress(progress: float, stage: str):
        with _jobs_lock:
            job = _jobs.get(job_id)
            if job:
                job.progress = progress
                job.stage = stage
                job.status = "processing"

    # Only one job can use the GPU at a time
    acquired = _pipeline_semaphore.acquire(timeout=0)
    if not acquired:
        # Another job is running — wait for it
        on_progress(0.0, "queued")
        _pipeline_semaphore.acquire()

    try:
        on_progress(0.0, "starting")
        viewer_url = os.environ.get("VIEWER_URL", "https://viewer-juliansaks-gmailcoms-projects.vercel.app")

        result = run_pipeline(
            video_path=video_path,
            brief=brief,
            groq_api_key=groq_api_key,
            viewer_url=viewer_url,
            share_id=job_id,
            on_progress=on_progress,
        )

        with _jobs_lock:
            job = _jobs.get(job_id)
            if job:
                job.status = "complete"
                job.progress = 1.0
                job.stage = "complete"
                job.share_url = result.get("share_url")
                job.report = result.get("report")
                job.completed_at = time.time()

        logger.info("Job %s complete: %s", job_id, result.get("share_url"))

    except Exception as e:
        logger.error("Job %s failed: %s", job_id, e, exc_info=True)
        with _jobs_lock:
            job = _jobs.get(job_id)
            if job:
                job.status = "error"
                job.error = "Processing failed. Check server logs for details."
                job.completed_at = time.time()

    finally:
        _pipeline_semaphore.release()
        # Cleanup upload and job output
        upload_dir = Path(f"./uploads/{job_id}")
        if upload_dir.exists():
            shutil.rmtree(upload_dir, ignore_errors=True)
        job_dir = Path(f"./jobs/{job_id}")
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
