#!/usr/bin/env python3
# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the license found in the
# LICENSE file in the root directory of this source tree.

"""
Export brain mesh, model predictions, and stimulus metadata for a React/Three.js frontend.

Handles Steps 1-3 of the web visualization pipeline:
  Step 1 - Brain mesh geometry (vertices, faces, sulcal depth, HCP parcellation)
  Step 2 - Model predictions (normalized activation maps per timestep)
  Step 3 - Stimulus metadata (segments, thumbnails, source media)

Usage:
    python export_for_web.py \
        --video_path path/to/clip.mp4 \
        --output_dir viewer/public/data \
        --cache_folder ./cache \
        --device auto
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
from pathlib import Path

import nibabel as nib
import numpy as np
from nilearn.datasets import fetch_surf_fsaverage

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

N_VERTICES_PER_HEMI = 10_242
N_VERTICES_TOTAL = 2 * N_VERTICES_PER_HEMI  # 20484
N_FACES_PER_HEMI = 20_480
N_FACES_TOTAL = 2 * N_FACES_PER_HEMI  # 40960
HEMISPHERE_GAP = 3.0  # mm offset along X axis


# ---------------------------------------------------------------------------
# Step 1: Export Brain Mesh
# ---------------------------------------------------------------------------

def export_mesh(output_dir: Path) -> None:
    """Export fsaverage5 mesh geometry, sulcal depth, and HCP-MMP1 parcellation."""
    mesh_dir = output_dir / "mesh"
    mesh_dir.mkdir(parents=True, exist_ok=True)

    log.info("Step 1: Exporting brain mesh data ...")

    # --- Load fsaverage5 surfaces ---
    log.info("  Fetching fsaverage5 surfaces via nilearn ...")
    fsaverage = fetch_surf_fsaverage("fsaverage5")

    all_coords = []
    all_faces = []
    all_sulc = []
    vertex_offset = 0

    for hemi in ("left", "right"):
        log.info("  Processing %s hemisphere ...", hemi)

        # Load pial and inflated surfaces
        pial_data = nib.load(getattr(fsaverage, f"pial_{hemi}")).darrays
        pial_coords = pial_data[0].data
        faces = pial_data[1].data

        infl_data = nib.load(getattr(fsaverage, f"infl_{hemi}")).darrays
        infl_coords = infl_data[0].data

        # Half-inflated = 0.5 * pial + 0.5 * inflated
        coords = 0.5 * pial_coords + 0.5 * infl_coords

        # Apply hemisphere gap offset along X axis
        # (mirrors the logic in tribev2/plotting/base.py get_mesh)
        if hemi == "left":
            coords[:, 0] = coords[:, 0] - coords[:, 0].max() - HEMISPHERE_GAP
        else:
            coords[:, 0] = coords[:, 0] - coords[:, 0].min() + HEMISPHERE_GAP

        # Load sulcal depth
        sulc = nib.load(getattr(fsaverage, f"sulc_{hemi}")).darrays[0].data

        # Offset faces for the right hemisphere so indices are global
        offset_faces = faces + vertex_offset
        vertex_offset += coords.shape[0]

        all_coords.append(coords)
        all_faces.append(offset_faces)
        all_sulc.append(sulc)

    vertices = np.concatenate(all_coords, axis=0).astype(np.float32)
    faces = np.concatenate(all_faces, axis=0).astype(np.uint32)
    sulcal_depth = np.concatenate(all_sulc, axis=0).astype(np.float32)

    assert vertices.shape == (N_VERTICES_TOTAL, 3), f"Unexpected vertices shape: {vertices.shape}"
    assert faces.shape == (N_FACES_TOTAL, 3), f"Unexpected faces shape: {faces.shape}"
    assert sulcal_depth.shape == (N_VERTICES_TOTAL,), f"Unexpected sulcal depth shape: {sulcal_depth.shape}"

    # --- Write binary files ---
    vertices_path = mesh_dir / "vertices.bin"
    faces_path = mesh_dir / "faces.bin"
    sulc_path = mesh_dir / "sulcal_depth.bin"

    vertices.tofile(str(vertices_path))
    log.info("  Wrote vertices: %s  (%d x 3, float32, %.1f KB)",
             vertices_path, vertices.shape[0], vertices_path.stat().st_size / 1024)

    faces.tofile(str(faces_path))
    log.info("  Wrote faces: %s  (%d x 3, uint32, %.1f KB)",
             faces_path, faces.shape[0], faces_path.stat().st_size / 1024)

    sulcal_depth.tofile(str(sulc_path))
    log.info("  Wrote sulcal depth: %s  (%d, float32, %.1f KB)",
             sulc_path, sulcal_depth.shape[0], sulc_path.stat().st_size / 1024)

    # --- Export HCP-MMP1 parcellation ---
    log.info("  Exporting HCP-MMP1 parcellation ...")
    _export_hcp_parcellation(mesh_dir)

    log.info("Step 1 complete: mesh data written to %s", mesh_dir)


def _get_hcp_labels_standalone() -> dict[str, np.ndarray]:
    """Standalone HCP-MMP1 label loader that only needs mne.

    This mirrors the logic in ``tribev2.utils.get_hcp_labels`` but avoids
    importing the full tribev2 package (which has heavy dependencies).
    """
    import mne

    subjects_dir = Path(mne.datasets.sample.data_path()) / "subjects"
    mne.datasets.fetch_hcp_mmp_parcellation(
        subjects_dir=subjects_dir, accept=True, verbose=True, combine=False,
    )
    # fsaverage5 has 10242 vertices per hemisphere
    expected_size = N_VERTICES_PER_HEMI

    combined: dict[str, np.ndarray] = {}
    for hemi in ("left", "right"):
        labels = mne.read_labels_from_annot(
            "fsaverage", "HCPMMP1", hemi="both", subjects_dir=subjects_dir,
        )
        label_to_vertices: dict[str, np.ndarray] = {}
        for label in labels:
            name = label.name[2:]  # strip leading "L_" / "R_"
            name = name.replace("_ROI", "")
            if (hemi == "right" and "-lh" in name) or (hemi == "left" and "-rh" in name):
                continue
            name = name.replace("-rh", "").replace("-lh", "")
            label_to_vertices[name] = np.array(label.vertices)
        index_offset = expected_size if hemi == "right" else 0
        label_to_vertices = {
            k: v[v < expected_size] + index_offset
            for k, v in label_to_vertices.items()
        }
        for k, v in label_to_vertices.items():
            if k in combined:
                combined[k] = np.concatenate([combined[k], v])
            else:
                combined[k] = v
    return combined


def _load_hcp_labels() -> dict[str, np.ndarray]:
    """Try tribev2.utils first; fall back to standalone loader."""
    try:
        from tribev2.utils import get_hcp_labels
        return get_hcp_labels(mesh="fsaverage5", combine=False, hemi="both")
    except Exception as e:
        log.info("  tribev2.utils not available (%s), using standalone HCP loader ...", e)
    try:
        return _get_hcp_labels_standalone()
    except Exception as e:
        log.warning("  HCP parcellation unavailable (%s) -- skipping", e)
        return {}


def _export_hcp_parcellation(mesh_dir: Path) -> None:
    """Export vertex-to-ROI-index mapping and ROI name list."""
    labels_dict = _load_hcp_labels()
    if not labels_dict:
        log.warning("  No HCP labels loaded -- writing empty parcellation files")
        roi_names = ["unknown"]
        vertex_roi = np.zeros(N_VERTICES_TOTAL, dtype=np.uint16)
    else:
        # Build sorted list of ROI names (index 0 = "unknown" for unlabeled vertices)
        roi_names = ["unknown"] + sorted(labels_dict.keys())
        roi_name_to_idx = {name: idx for idx, name in enumerate(roi_names)}

        # Build per-vertex ROI index array
        vertex_roi = np.zeros(N_VERTICES_TOTAL, dtype=np.uint16)
        for name, verts in labels_dict.items():
            idx = roi_name_to_idx[name]
            for v in verts:
                if v < N_VERTICES_TOTAL:
                    vertex_roi[int(v)] = idx

    # Write binary
    roi_path = mesh_dir / "parcellation.bin"
    vertex_roi.tofile(str(roi_path))
    log.info("  Wrote parcellation: %s  (%d vertices, uint16, %.1f KB)",
             roi_path, vertex_roi.shape[0], roi_path.stat().st_size / 1024)

    # Write ROI names JSON
    roi_json_path = mesh_dir / "roi_names.json"
    with open(roi_json_path, "w") as f:
        json.dump(roi_names, f, indent=2)
    log.info("  Wrote ROI names: %s  (%d ROIs)", roi_json_path, len(roi_names))


# ---------------------------------------------------------------------------
# Step 2: Export Predictions
# ---------------------------------------------------------------------------

def export_predictions(
    video_path: str | None,
    audio_path: str | None,
    text_path: str | None,
    output_dir: Path,
    cache_folder: str,
    device: str,
) -> tuple[np.ndarray, list]:
    """Load model, run inference, normalize, and export predictions."""
    pred_dir = output_dir / "predictions"
    pred_dir.mkdir(parents=True, exist_ok=True)

    log.info("Step 2: Generating and exporting predictions ...")

    # --- Load model ---
    log.info("  Loading TribeModel from pretrained checkpoint ...")
    from tribev2.demo_utils import TribeModel

    model = TribeModel.from_pretrained(
        "facebook/tribev2",
        cache_folder=cache_folder,
        device=device,
    )

    # --- Build events dataframe ---
    log.info("  Building events dataframe ...")
    events_df = model.get_events_dataframe(
        video_path=video_path,
        audio_path=audio_path,
        text_path=text_path,
    )
    log.info("  Events dataframe has %d rows", len(events_df))

    # --- Run predictions ---
    log.info("  Running model.predict() ...")
    preds, segments = model.predict(events_df, verbose=True)
    n_timesteps, n_vertices = preds.shape
    log.info("  Raw predictions shape: (%d, %d)", n_timesteps, n_vertices)

    assert n_vertices == N_VERTICES_TOTAL, (
        f"Expected {N_VERTICES_TOTAL} vertices, got {n_vertices}"
    )

    # --- Robust normalization ---
    log.info("  Applying robust_normalize (percentile=99) ...")
    from tribev2.plotting.utils import robust_normalize

    preds_norm = robust_normalize(preds, percentile=99).astype(np.float32)

    # --- Write predictions binary blob ---
    pred_path = pred_dir / "predictions.bin"
    preds_norm.tofile(str(pred_path))
    log.info("  Wrote predictions: %s  (%d x %d, float32, %.1f MB)",
             pred_path, n_timesteps, n_vertices,
             pred_path.stat().st_size / (1024 * 1024))

    # --- Write metadata ---
    metadata = {
        "nTimesteps": int(n_timesteps),
        "nVertices": int(n_vertices),
        "trSeconds": 1.0,
        "vmin": 0.5,
        "alphaScale": 0.2,
    }
    meta_path = pred_dir / "metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    log.info("  Wrote metadata: %s", meta_path)

    log.info("Step 2 complete: predictions written to %s", pred_dir)
    return preds_norm, segments


# ---------------------------------------------------------------------------
# Step 3: Export Stimulus Metadata
# ---------------------------------------------------------------------------

def export_stimulus_metadata(
    segments: list,
    source_media_path: str | None,
    output_dir: Path,
) -> None:
    """Export per-timestep segment info, thumbnails, and source media."""
    stim_dir = output_dir / "stimulus"
    stim_dir.mkdir(parents=True, exist_ok=True)

    log.info("Step 3: Exporting stimulus metadata ...")

    # --- Build segments.json ---
    log.info("  Building per-timestep segment info ...")
    segments_data = []
    for i, seg in enumerate(segments):
        entry = {
            "time": float(seg.start),
            "hasEvents": len(seg.ns_events) > 0,
            "words": [],
        }
        for ev in seg.ns_events:
            if ev.__class__.__name__ == "Word":
                entry["words"].append({
                    "text": str(ev.text),
                    "start": float(ev.start),
                    "end": float(ev.start + ev.duration),
                })
        segments_data.append(entry)

    seg_path = stim_dir / "segments.json"
    with open(seg_path, "w") as f:
        json.dump(segments_data, f, indent=2)
    log.info("  Wrote segments: %s  (%d entries)", seg_path, len(segments_data))

    # --- Extract video thumbnails if video input ---
    if source_media_path is not None:
        media_path = Path(source_media_path)
        suffix = media_path.suffix.lower()

        if suffix in (".mp4", ".avi", ".mkv", ".mov", ".webm"):
            _extract_thumbnails(segments, media_path, stim_dir)

        # Copy source media into output directory
        dest = stim_dir / media_path.name
        if not dest.exists() or dest.resolve() != media_path.resolve():
            log.info("  Copying source media to %s ...", dest)
            shutil.copy2(str(media_path), str(dest))
            log.info("  Copied source media: %s (%.1f MB)",
                     dest, dest.stat().st_size / (1024 * 1024))

    log.info("Step 3 complete: stimulus metadata written to %s", stim_dir)


def _extract_thumbnails(segments: list, video_path: Path, stim_dir: Path) -> None:
    """Extract one JPEG frame per TR from the video."""
    thumb_dir = stim_dir / "thumbnails"
    thumb_dir.mkdir(parents=True, exist_ok=True)

    log.info("  Extracting video thumbnails (one per TR) ...")

    try:
        from moviepy import VideoFileClip
    except ImportError:
        log.warning("  moviepy not available -- skipping thumbnail extraction")
        return

    clip = VideoFileClip(str(video_path))

    # Find the Video event to determine offset
    video_offset = 0.0
    for seg in segments:
        for ev in seg.ns_events:
            if ev.__class__.__name__ == "Video":
                video_offset = ev.start - ev.offset
                break
        else:
            continue
        break

    n_extracted = 0
    for i, seg in enumerate(segments):
        # Compute the time within the video clip for this segment
        t_in_clip = seg.start - video_offset
        if t_in_clip < 0 or t_in_clip >= clip.duration:
            continue
        try:
            frame = clip.get_frame(t_in_clip)
        except Exception:
            continue

        # Save as JPEG using PIL
        from PIL import Image
        img = Image.fromarray(frame)
        thumb_path = thumb_dir / f"frame_{i:05d}.jpg"
        img.save(str(thumb_path), "JPEG", quality=80)
        n_extracted += 1

    clip.close()
    log.info("  Extracted %d thumbnails to %s", n_extracted, thumb_dir)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export brain mesh, predictions, and stimulus data for web viewer.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--video_path", type=str, default=None,
                             help="Path to input video file")
    input_group.add_argument("--audio_path", type=str, default=None,
                             help="Path to input audio file")
    input_group.add_argument("--text_path", type=str, default=None,
                             help="Path to input text file")

    parser.add_argument("--output_dir", type=str,
                        default="viewer/public/data",
                        help="Output directory (default: viewer/public/data)")
    parser.add_argument("--cache_folder", type=str, default="./cache",
                        help="Cache folder for model/features (default: ./cache)")
    parser.add_argument("--device", type=str, default="auto",
                        help="Torch device: auto, cpu, cuda (default: auto)")

    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log.info("Output directory: %s", output_dir.resolve())

    # Determine which media file was provided
    source_media = args.video_path or args.audio_path or args.text_path

    # Step 1: Export mesh (always needed)
    export_mesh(output_dir)

    # Step 2: Export predictions
    preds_norm, segments = export_predictions(
        video_path=args.video_path,
        audio_path=args.audio_path,
        text_path=args.text_path,
        output_dir=output_dir,
        cache_folder=args.cache_folder,
        device=args.device,
    )

    # Step 3: Export stimulus metadata
    export_stimulus_metadata(segments, source_media, output_dir)

    log.info("=" * 60)
    log.info("All exports complete!")
    log.info("  Mesh:        %s/mesh/", output_dir)
    log.info("  Predictions: %s/predictions/", output_dir)
    log.info("  Stimulus:    %s/stimulus/", output_dir)
    log.info("=" * 60)


if __name__ == "__main__":
    main()
