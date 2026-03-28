#!/usr/bin/env python3
# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the license found in the
# LICENSE file in the root directory of this source tree.

"""
Export brain mesh data ONLY -- no model or media input required.

Useful for frontend development before having real predictions.
Also generates a synthetic sine-wave prediction so the frontend
can be developed against realistic data shapes.

Usage:
    python export_mesh_only.py [--output_dir viewer/public/data]
"""

from __future__ import annotations

import argparse
import json
import logging
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
SYNTHETIC_N_TIMESTEPS = 60


# ---------------------------------------------------------------------------
# Mesh export (identical logic to export_for_web.py Step 1)
# ---------------------------------------------------------------------------

def export_mesh(output_dir: Path) -> np.ndarray:
    """Export fsaverage5 mesh and return the combined vertex coordinates.

    Returns the (20484, 3) float32 vertex array so it can be reused by
    the synthetic prediction generator.
    """
    mesh_dir = output_dir / "mesh"
    mesh_dir.mkdir(parents=True, exist_ok=True)

    log.info("Exporting brain mesh data ...")

    # --- Load fsaverage5 surfaces ---
    log.info("  Fetching fsaverage5 surfaces via nilearn ...")
    fsaverage = fetch_surf_fsaverage("fsaverage5")

    all_coords = []
    all_faces = []
    all_sulc = []
    vertex_offset = 0

    for hemi in ("left", "right"):
        log.info("  Processing %s hemisphere ...", hemi)

        pial_data = nib.load(getattr(fsaverage, f"pial_{hemi}")).darrays
        pial_coords = pial_data[0].data
        faces = pial_data[1].data

        infl_data = nib.load(getattr(fsaverage, f"infl_{hemi}")).darrays
        infl_coords = infl_data[0].data

        # Half-inflated = 0.5 * pial + 0.5 * inflated
        coords = 0.5 * pial_coords + 0.5 * infl_coords

        # Apply hemisphere gap offset along X axis
        if hemi == "left":
            coords[:, 0] = coords[:, 0] - coords[:, 0].max() - HEMISPHERE_GAP
        else:
            coords[:, 0] = coords[:, 0] - coords[:, 0].min() + HEMISPHERE_GAP

        sulc = nib.load(getattr(fsaverage, f"sulc_{hemi}")).darrays[0].data

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

    log.info("Mesh export complete: %s", mesh_dir)
    return vertices


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
        roi_names = ["unknown"] + sorted(labels_dict.keys())
        roi_name_to_idx = {name: idx for idx, name in enumerate(roi_names)}

        vertex_roi = np.zeros(N_VERTICES_TOTAL, dtype=np.uint16)
        for name, verts in labels_dict.items():
            idx = roi_name_to_idx[name]
            for v in verts:
                if v < N_VERTICES_TOTAL:
                    vertex_roi[int(v)] = idx

    roi_path = mesh_dir / "parcellation.bin"
    vertex_roi.tofile(str(roi_path))
    log.info("  Wrote parcellation: %s  (%d vertices, uint16, %.1f KB)",
             roi_path, vertex_roi.shape[0], roi_path.stat().st_size / 1024)

    roi_json_path = mesh_dir / "roi_names.json"
    with open(roi_json_path, "w") as f:
        json.dump(roi_names, f, indent=2)
    log.info("  Wrote ROI names: %s  (%d ROIs)", roi_json_path, len(roi_names))


# ---------------------------------------------------------------------------
# Synthetic prediction generator
# ---------------------------------------------------------------------------

def generate_synthetic_predictions(
    vertices: np.ndarray,
    output_dir: Path,
    n_timesteps: int = SYNTHETIC_N_TIMESTEPS,
) -> None:
    """Generate a synthetic sine-wave prediction to help frontend development.

    The pattern creates a travelling wave across the brain surface so all
    aspects of the visualization pipeline can be exercised: per-vertex
    colouring, temporal animation, and colormap thresholding.
    """
    pred_dir = output_dir / "predictions"
    pred_dir.mkdir(parents=True, exist_ok=True)

    log.info("Generating synthetic predictions (%d timesteps, %d vertices) ...",
             n_timesteps, vertices.shape[0])

    # Use the X coordinate of each vertex to create a spatial gradient.
    # Add a temporal phase shift so the wave travels across the brain.
    x_coords = vertices[:, 0]

    # Normalize x to [0, 1] for the spatial component
    x_min, x_max = x_coords.min(), x_coords.max()
    x_norm = (x_coords - x_min) / (x_max - x_min + 1e-8)

    # Also use Y coordinate for a secondary spatial frequency
    y_coords = vertices[:, 1]
    y_min, y_max = y_coords.min(), y_coords.max()
    y_norm = (y_coords - y_min) / (y_max - y_min + 1e-8)

    preds = np.zeros((n_timesteps, vertices.shape[0]), dtype=np.float32)

    for t in range(n_timesteps):
        phase = 2.0 * np.pi * t / n_timesteps

        # Primary travelling wave along X
        wave_x = np.sin(2.0 * np.pi * x_norm * 2.0 + phase)

        # Secondary wave along Y (higher frequency, lower amplitude)
        wave_y = 0.3 * np.sin(2.0 * np.pi * y_norm * 3.0 - phase * 0.7)

        # Combine and normalize to [0, 1]
        combined = wave_x + wave_y
        combined = (combined - combined.min()) / (combined.max() - combined.min() + 1e-8)

        preds[t] = combined

    # --- Write predictions binary blob ---
    pred_path = pred_dir / "predictions.bin"
    preds.tofile(str(pred_path))
    log.info("  Wrote synthetic predictions: %s  (%d x %d, float32, %.1f MB)",
             pred_path, n_timesteps, vertices.shape[0],
             pred_path.stat().st_size / (1024 * 1024))

    # --- Write metadata ---
    metadata = {
        "nTimesteps": int(n_timesteps),
        "nVertices": int(vertices.shape[0]),
        "trSeconds": 1.0,
        "vmin": 0.5,
        "alphaScale": 0.2,
    }
    meta_path = pred_dir / "metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    log.info("  Wrote metadata: %s", meta_path)

    # --- Write synthetic segments.json ---
    stim_dir = output_dir / "stimulus"
    stim_dir.mkdir(parents=True, exist_ok=True)

    segments_data = []
    for t in range(n_timesteps):
        segments_data.append({
            "time": float(t),
            "hasEvents": True,
            "words": [{"text": f"t={t}s", "start": float(t), "end": float(t + 1)}],
        })

    seg_path = stim_dir / "segments.json"
    with open(seg_path, "w") as f:
        json.dump(segments_data, f, indent=2)
    log.info("  Wrote synthetic segments: %s  (%d entries)", seg_path, n_timesteps)

    log.info("Synthetic predictions export complete.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export brain mesh only (no model required). "
                    "Also generates synthetic predictions for frontend development.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--output_dir", type=str,
                        default="viewer/public/data",
                        help="Output directory (default: viewer/public/data)")
    parser.add_argument("--n_timesteps", type=int, default=SYNTHETIC_N_TIMESTEPS,
                        help="Number of synthetic timesteps (default: 60)")
    parser.add_argument("--skip_synthetic", action="store_true",
                        help="Skip generating synthetic predictions")

    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log.info("Output directory: %s", output_dir.resolve())

    # Export mesh and get vertex coordinates back
    vertices = export_mesh(output_dir)

    # Generate synthetic predictions unless skipped
    if not args.skip_synthetic:
        generate_synthetic_predictions(vertices, output_dir, n_timesteps=args.n_timesteps)

    log.info("=" * 60)
    log.info("All exports complete!")
    log.info("  Mesh:        %s/mesh/", output_dir)
    if not args.skip_synthetic:
        log.info("  Predictions: %s/predictions/", output_dir)
        log.info("  Stimulus:    %s/stimulus/", output_dir)
    log.info("=" * 60)


if __name__ == "__main__":
    main()
