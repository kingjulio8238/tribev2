"""Full pipeline orchestration — video in, share URL out.

Takes a video file + brief, runs the entire TRIBE v2 pipeline,
and returns a shareable viewer URL with brain activations,
emotions, and effectiveness report.
"""

import gc
import json
import logging
import shutil
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable

import numpy as np
import torch

logger = logging.getLogger(__name__)

# Progress callback type: (progress: float 0-1, stage: str) -> None
ProgressCallback = Callable[[float, str], None]


def _noop_progress(progress: float, stage: str) -> None:
    pass


def run_pipeline(
    video_path: str,
    brief: dict[str, Any] | None = None,
    groq_api_key: str | None = None,
    viewer_url: str = "https://viewer-juliansaks-gmailcoms-projects.vercel.app",
    share_id: str | None = None,
    on_progress: ProgressCallback = _noop_progress,
) -> dict[str, Any]:
    """Run the full TRIBE v2 pipeline on a video.

    Parameters
    ----------
    video_path:
        Path to input video file.
    brief:
        Optional video brief dict for effectiveness report.
    groq_api_key:
        Optional Groq API key for emotion + report analysis.
    viewer_url:
        Base URL of the deployed viewer.
    share_id:
        Custom share ID. Auto-generated if None.
    on_progress:
        Callback for progress updates.

    Returns
    -------
    dict with share_url, report (if generated), job metadata.
    """
    from api.models import ModelManager
    from tribev2.optimize import preconvert_video
    from tribev2.main import _free_extractor_model
    from tribev2.plotting.utils import robust_normalize
    from neuralset.events.utils import standardize_events
    from neuralset.events.etypes import EventTypesHelper
    import neuralset as ns
    import pandas as pd
    from einops import rearrange
    from tqdm import tqdm

    manager = ModelManager.get()
    model = manager.model

    if share_id is None:
        share_id = uuid.uuid4().hex[:12]

    output_dir = Path(f"./jobs/{share_id}")
    output_dir.mkdir(parents=True, exist_ok=True)

    result: dict[str, Any] = {"share_id": share_id}

    # ── 1. Pre-convert video ──
    on_progress(0.02, "converting_video")
    video_path = preconvert_video(video_path, str(output_dir / "input.mp4"))
    logger.info("Video ready: %s", video_path)

    # ── 2. Build events ──
    on_progress(0.05, "building_events")
    df = model.get_events_dataframe(video_path=video_path)
    logger.info("Events: %d rows", len(df))

    # ── 3. Feature extraction ──
    on_progress(0.10, "extracting_features")
    events = standardize_events(df)

    extractors = {}
    for modality in model.data.features_to_use:
        extractors[modality] = getattr(model.data, f"{modality}_feature")
    extractors["subject_id"] = model.data.subject_id

    # Add dummy trigger events
    dummy_events = []
    for timeline_name, timeline in events.groupby("timeline"):
        dummy_events.append({
            "type": "CategoricalEvent",
            "timeline": timeline_name,
            "start": timeline.start.min(),
            "duration": timeline.stop.max() - timeline.start.min(),
            "split": "all",
            "subject": timeline.subject.unique()[0],
        })
    events_with_triggers = pd.concat([events, pd.DataFrame(dummy_events)])
    events_with_triggers = standardize_events(events_with_triggers)

    # Remove extractors with no matching events
    to_remove = set()
    for name, ext in extractors.items():
        event_types = EventTypesHelper(ext.event_types).names
        if not any(et in events_with_triggers.type.unique() for et in event_types):
            to_remove.add(name)
    for name in to_remove:
        del extractors[name]

    # Move brain model to CPU for extraction
    manager.free_gpu_for_extraction()

    # Run text + audio in parallel, then video sequentially
    parallel_names = {"text", "audio"}
    parallel_extractors = {n: e for n, e in extractors.items() if n in parallel_names}
    sequential_extractors = {n: e for n, e in extractors.items() if n not in parallel_names}

    if len(parallel_extractors) >= 2:
        on_progress(0.15, "extracting_text_audio")
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = {
                executor.submit(lambda e: e.prepare(events_with_triggers), ext): name
                for name, ext in parallel_extractors.items()
            }
            for future in futures:
                future.result()
        for ext in parallel_extractors.values():
            _free_extractor_model(ext)
        gc.collect()
        torch.cuda.empty_cache()
    else:
        for name, ext in parallel_extractors.items():
            ext.prepare(events_with_triggers)
            _free_extractor_model(ext)
            gc.collect()
            torch.cuda.empty_cache()

    on_progress(0.20, "extracting_video")
    for name, ext in sequential_extractors.items():
        ext.prepare(events_with_triggers)
        if name != "subject_id":
            _free_extractor_model(ext)
            gc.collect()
            torch.cuda.empty_cache()

    on_progress(0.80, "building_dataloader")

    # ── 4. Build dataloader ──
    TR = model.data.TR
    segments = ns.segments.list_segments(
        events_with_triggers,
        triggers=events_with_triggers.type == "CategoricalEvent",
        stride=(model.data.duration_trs - model.data.overlap_trs_train) * TR,
        duration=model.data.duration_trs * TR,
        stride_drop_incomplete=model.data.stride_drop_incomplete,
    )
    dataset = ns.dataloader.SegmentDataset(
        extractors=extractors, segments=segments, remove_incomplete_segments=False,
    )
    loader = dataset.build_dataloader(
        shuffle=False, num_workers=model.data.num_workers, batch_size=model.data.batch_size,
    )

    # ── 5. Inference ──
    on_progress(0.82, "running_inference")
    manager.restore_gpu_for_inference()
    brain_model = model._model

    preds_list, all_segments = [], []
    n_samples, n_kept = 0, 0
    with torch.inference_mode():
        for batch in tqdm(loader, desc="Inference"):
            batch = batch.to(brain_model.device)
            batch_segments = []
            for segment in batch.segments:
                for t in np.arange(0, segment.duration - 1e-2, TR):
                    batch_segments.append(segment.copy(offset=t, duration=TR))
            keep = np.array([len(s.ns_events) > 0 for s in batch_segments])
            n_kept += keep.sum()
            n_samples += len(batch_segments)
            batch_segments = [s for i, s in enumerate(batch_segments) if keep[i]]
            y_pred = brain_model(batch).detach().cpu().numpy()
            y_pred = rearrange(y_pred, "b d t -> (b t) d")[keep]
            preds_list.append(y_pred)
            all_segments.extend(batch_segments)

    preds = np.concatenate(preds_list)
    logger.info("Predictions: %s (%d/%d segments)", preds.shape, n_kept, n_samples)

    # ── 6. Normalize ──
    on_progress(0.88, "normalizing")
    preds_norm = robust_normalize(preds, percentile=99).astype(np.float32)

    # ── 7. Export ──
    on_progress(0.90, "exporting")

    # Mesh (copy from pre-generated cache)
    mesh_dir = output_dir / "mesh"
    mesh_dir.mkdir(parents=True, exist_ok=True)
    for f in manager.mesh_dir.glob("*"):
        shutil.copy2(str(f), str(mesh_dir / f.name))

    # Predictions
    pred_dir = output_dir / "predictions"
    pred_dir.mkdir(parents=True, exist_ok=True)
    preds_norm.tofile(str(pred_dir / "predictions.bin"))
    n_timesteps = preds_norm.shape[0]
    metadata = {
        "nTimesteps": int(n_timesteps),
        "nVertices": int(preds_norm.shape[1]),
        "trSeconds": 1.0,
        "vmin": 0.5,
        "alphaScale": 0.2,
    }
    with open(pred_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    # Stimulus
    stim_dir = output_dir / "stimulus"
    stim_dir.mkdir(parents=True, exist_ok=True)
    segments_data = []
    for seg in all_segments:
        entry = {"time": float(seg.start), "hasEvents": len(seg.ns_events) > 0, "words": []}
        for ev in seg.ns_events:
            if ev.__class__.__name__ == "Word":
                entry["words"].append({
                    "text": str(ev.text),
                    "start": float(ev.start),
                    "end": float(ev.start + ev.duration),
                })
        segments_data.append(entry)
    with open(stim_dir / "segments.json", "w") as f:
        json.dump(segments_data, f, indent=2)

    # Re-encode video for viewer
    import subprocess
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-c:v", "libx264", "-crf", "23",
             "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
             str(stim_dir / "media.mp4")],
            capture_output=True, timeout=600, check=True,
        )
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as e:
        logger.warning("ffmpeg re-encode failed, copying original: %s", e)
        shutil.copy2(video_path, str(stim_dir / "media.mp4"))

    # Thumbnails
    thumb_dir = stim_dir / "thumbnails"
    thumb_dir.mkdir(exist_ok=True)
    try:
        from moviepy import VideoFileClip
        from PIL import Image
        clip = VideoFileClip(video_path)
        for i, seg in enumerate(all_segments):
            t = seg.start
            if 0 <= t < clip.duration:
                frame = clip.get_frame(t)
                Image.fromarray(frame).save(str(thumb_dir / f"frame_{i:05d}.jpg"), "JPEG", quality=80)
        clip.close()
    except Exception as e:
        logger.warning("Thumbnails skipped: %s", e)

    # ── 8. Groq analysis ──
    if groq_api_key:
        on_progress(0.93, "analyzing_emotions")
        try:
            from tribev2.analysis import (
                compute_lobe_timeseries, generate_emotions, save_emotions,
                generate_report, save_report,
            )
            lobe_ts = compute_lobe_timeseries(preds_norm)
            emotions = generate_emotions(lobe_ts, n_timesteps, groq_api_key)
            save_emotions(emotions, str(output_dir))

            if brief and brief.get("title"):
                on_progress(0.96, "generating_report")
                report = generate_report(brief, lobe_ts, emotions, segments_data, groq_api_key)
                save_report(report, str(output_dir))
                result["report"] = report
        except Exception as e:
            logger.error("Groq analysis failed: %s", e)
            result["analysis_error"] = str(e)

    # ── 9. Upload to R2 ──
    on_progress(0.98, "uploading")
    try:
        from tribev2.share import upload_to_r2
        share_url = upload_to_r2(
            data_dir=str(output_dir),
            viewer_url=viewer_url,
            share_id=share_id,
        )
        result["share_url"] = share_url
    except Exception as e:
        logger.error("R2 upload failed: %s", e)
        result["upload_error"] = str(e)

    on_progress(1.0, "complete")
    result["n_timesteps"] = n_timesteps
    result["status"] = "complete"
    logger.info("Pipeline complete: %s", result.get("share_url", share_id))
    return result
