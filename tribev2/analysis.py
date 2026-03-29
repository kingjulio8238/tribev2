# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the license found in the
# LICENSE file in the root directory of this source tree.

"""Post-processing analysis: emotion scoring and effectiveness reports via Groq.

Usage::

    from tribev2.analysis import generate_emotions, generate_report

    emotions = generate_emotions(preds_norm, lobe_timeseries, n_timesteps, api_key)
    report = generate_report(video_brief, lobe_timeseries, emotions, segments, api_key)
"""

import json
import logging
import typing as tp
from pathlib import Path

import numpy as np
import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
#  Lobe definitions for activation computation
# ---------------------------------------------------------------------------

LOBE_NAMES = ["Frontal", "Temporal", "Parietal", "Occipital", "Insular", "Cingulate"]

LOBE_ROIS: dict[str, list[str]] = {
    "Frontal": [
        "IFSp", "IFSa", "IFJa", "IFJp", "46", "p47r", "a47r", "47s", "47m", "44", "45",
        "6a", "6d", "6ma", "6mp", "6r", "6v", "8Av", "8Ad", "8BL", "8C", "9a", "9m", "9p",
        "i6-8", "s6-8", "SFL", "SCEF", "p9-46v", "a9-46v", "9-46d", "p10p", "a10p",
        "10d", "10r", "10v", "10pp", "11l", "13l", "OFC", "pOFC", "a24", "p24", "s32",
        "a32pr", "p32pr", "d32", "p32", "25",
    ],
    "Temporal": [
        "A1", "A4", "A5", "LBelt", "MBelt", "PBelt", "RI", "STSdp", "STSda", "STSva",
        "STSvp", "STGa", "TE1a", "TE1m", "TE1p", "TE2a", "TE2p", "TGd", "TGv",
        "TF", "EC", "PeEc", "PHA1", "PHA2", "PHA3", "H",
    ],
    "Parietal": [
        "1", "2", "3a", "3b", "5L", "5m", "5mv", "7AL", "7Am", "7PC", "7PL", "7Pm",
        "AIP", "IP0", "IP1", "IP2", "IPS1", "LIPd", "LIPv", "MIP", "VIP",
        "PFm", "PF", "PFop", "PFt", "PGi", "PGs", "PGp",
        "DVT", "ProS", "POS1", "POS2", "PCV", "7m", "31a", "31pd", "31pv", "d23ab", "v23ab",
    ],
    "Occipital": [
        "V1", "V2", "V3", "V3A", "V3B", "V3CD", "V4", "V4t", "V6", "V6A", "V7", "V8",
        "VMV1", "VMV2", "VMV3", "VVC", "FST", "FFC", "PIT", "LO1", "LO2", "LO3",
        "MST", "MT", "PH", "PHT",
    ],
    "Insular": [
        "Ig", "MI", "Pol1", "Pol2", "FOP1", "FOP2", "FOP3", "FOP4", "FOP5",
        "AVI", "AAIC", "Pir", "52",
    ],
    "Cingulate": [
        "a24pr", "p24pr", "33pr", "RSC", "23c", "23d",
        "d23ab", "v23ab", "POS2", "DVT", "ProS",
    ],
}


def compute_lobe_timeseries(
    preds_norm: np.ndarray,
    mesh: str = "fsaverage5",
) -> dict[str, list[float]]:
    """Compute per-lobe mean activation timeseries from normalized predictions.

    Parameters
    ----------
    preds_norm:
        Normalized predictions array of shape (n_timesteps, n_vertices).
    mesh:
        Mesh name for HCP label lookup.

    Returns
    -------
    Dict mapping lobe name to list of mean activations per timestep.
    """
    from tribev2.utils import get_hcp_labels

    labels_dict = get_hcp_labels(mesh=mesh, combine=False, hemi="both")
    n_ts = preds_norm.shape[0]

    # Build ROI → lobe mapping
    roi_to_lobe: dict[str, str] = {}
    for lobe, rois in LOBE_ROIS.items():
        for roi in rois:
            roi_to_lobe.setdefault(roi, lobe)

    # Build vertex index sets per lobe
    lobe_vertices: dict[str, list[int]] = {lobe: [] for lobe in LOBE_NAMES}
    for roi_name, vertices in labels_dict.items():
        clean = roi_name.split("_")[0] if "_" in roi_name else roi_name
        lobe = roi_to_lobe.get(clean)
        if lobe:
            lobe_vertices[lobe].extend(vertices)

    # Compute timeseries
    result: dict[str, list[float]] = {}
    for lobe in LOBE_NAMES:
        idxs = [int(v) for v in lobe_vertices[lobe] if int(v) < preds_norm.shape[1]]
        if idxs:
            result[lobe] = [round(float(preds_norm[t, idxs].mean()), 4) for t in range(n_ts)]
        else:
            result[lobe] = [0.0] * n_ts

    return result


# ---------------------------------------------------------------------------
#  Groq API helper
# ---------------------------------------------------------------------------

def _groq_chat(
    prompt: str,
    api_key: str,
    model: str = "llama-3.3-70b-versatile",
    temperature: float = 0.3,
    max_tokens: int = 8192,
) -> str:
    """Send a prompt to Groq and return the response text."""
    resp = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _parse_json_response(raw: str) -> tp.Any:
    """Parse JSON from LLM response, stripping markdown fences if present."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(raw)


# ---------------------------------------------------------------------------
#  Emotion analysis
# ---------------------------------------------------------------------------

def generate_emotions(
    lobe_timeseries: dict[str, list[float]],
    n_timesteps: int,
    api_key: str,
) -> list[dict]:
    """Generate per-timestep emotion scores via Groq.

    Returns list of {time, emotions: {name: float}} dicts.
    """
    prompt = f"""You are a neuroscience expert. Given brain region activation timeseries data from an fMRI prediction model watching a video, analyze the emotional response at each timestep.

Brain region activations (0-1 scale, {n_timesteps} timesteps at 1 TR/second):
{json.dumps(lobe_timeseries)}

Map these brain activations to the following emotions based on neuroscience:
- Engagement: driven by Frontal + Temporal activity (attention + language processing)
- Tension: driven by Insular + Cingulate activity (emotional arousal + conflict monitoring)
- Wonder: driven by Occipital + Parietal activity (visual novelty + spatial processing)
- Empathy: driven by Temporal + Insular activity (social cognition + emotional resonance)
- Excitement: driven by Frontal + Occipital activity (reward anticipation + visual stimulation)
- Unease: driven by Cingulate + Insular activity (anxiety + interoceptive awareness)

Return ONLY a JSON array with {n_timesteps} objects, one per timestep. Each object must have:
- "time": the timestep index (0-based)
- "emotions": object with keys Engagement, Tension, Wonder, Empathy, Excitement, Unease — each a float 0.0 to 1.0

Return raw JSON only, no markdown, no explanation."""

    logger.info("Generating emotions via Groq (%d timesteps)...", n_timesteps)
    raw = _groq_chat(prompt, api_key)
    emotions = _parse_json_response(raw)
    logger.info("Generated emotions: %d timesteps, %d emotions", len(emotions), len(emotions[0].get("emotions", {})))
    return emotions


# ---------------------------------------------------------------------------
#  Effectiveness report
# ---------------------------------------------------------------------------

def generate_report(
    video_brief: dict[str, tp.Any],
    lobe_timeseries: dict[str, list[float]],
    emotions: list[dict],
    segments: list[dict],
    api_key: str,
) -> dict:
    """Generate an effectiveness report via Groq.

    Parameters
    ----------
    video_brief:
        Dict with title, objective, target_audience, intended_emotions, etc.
    lobe_timeseries:
        Per-lobe activation timeseries from compute_lobe_timeseries().
    emotions:
        Per-timestep emotion data from generate_emotions().
    segments:
        Segment data from segments.json.
    api_key:
        Groq API key.

    Returns
    -------
    Structured report dict with overallScore, summary, emotionalArc,
    keyMoments, brainInsights, recommendations.
    """
    n_ts = len(next(iter(lobe_timeseries.values())))

    # Compute summary stats
    lobe_summary = {}
    for lobe in LOBE_NAMES:
        vals = lobe_timeseries[lobe]
        lobe_summary[lobe] = {
            "mean": round(sum(vals) / len(vals), 3),
            "peak": round(max(vals), 3),
            "peak_time": vals.index(max(vals)),
        }

    emotion_names = list(emotions[0]["emotions"].keys()) if emotions else []
    emotion_summary = {}
    for emo in emotion_names:
        vals = [e["emotions"][emo] for e in emotions]
        emotion_summary[emo] = {
            "mean": round(sum(vals) / len(vals), 3),
            "peak": round(max(vals), 3),
            "peak_time": vals.index(max(vals)),
        }

    # Build transcript
    transcript_parts = []
    for seg in segments:
        for w in seg.get("words", []):
            transcript_parts.append(f"{w['start']:.1f}s: {w['text']}")
    transcript_str = " | ".join(transcript_parts[:200])

    prompt = f"""You are a neuro-creative strategist. Analyze whether a video advertisement achieved its stated objectives based on brain imaging predictions and emotional response data.

## Video Brief
{json.dumps(video_brief, indent=2)}

## Brain Region Activity (per-lobe summary)
{json.dumps(lobe_summary, indent=2)}

## Brain Region Timeseries (0-1 scale, 1 TR/second)
{json.dumps(lobe_timeseries)}

## Emotional Response Summary
{json.dumps(emotion_summary, indent=2)}

## Emotional Response Timeseries
{json.dumps(emotions)}

## Transcript
{transcript_str}

Generate a structured effectiveness report. Return ONLY valid JSON with this exact schema:
{{
  "title": "string - video title",
  "overallScore": number 0-100,
  "summary": "string - 2-3 sentence executive summary of effectiveness",
  "emotionalArc": {{
    "intended": ["list of intended emotions from brief"],
    "actual": ["list of dominant actual emotions observed"],
    "alignment": number 0.0-1.0
  }},
  "keyMoments": [
    {{
      "time": number (start second),
      "endTime": number (end second),
      "label": "string - what happens",
      "engagement": number 0.0-1.0,
      "dominantEmotions": ["top 2 emotions"],
      "alignsWithObjective": boolean,
      "insight": "string - why this matters for the objective"
    }}
  ],
  "brainInsights": ["string - 3-5 key neuroscience-grounded observations"],
  "recommendations": ["string - 3-5 actionable recommendations to improve effectiveness"]
}}

Return raw JSON only, no markdown, no explanation."""

    logger.info("Generating effectiveness report via Groq...")
    raw = _groq_chat(prompt, api_key, max_tokens=4096)
    report = _parse_json_response(raw)
    logger.info("Report generated: score=%d, %d key moments", report.get("overallScore", 0), len(report.get("keyMoments", [])))
    return report


# ---------------------------------------------------------------------------
#  Convenience: save analysis results
# ---------------------------------------------------------------------------

def save_emotions(emotions: list[dict], output_dir: str | Path) -> Path:
    """Save emotions.json to the output directory."""
    path = Path(output_dir) / "emotions.json"
    with open(path, "w") as f:
        json.dump(emotions, f, indent=2)
    logger.info("Saved %s (%d timesteps)", path, len(emotions))
    return path


def save_report(report: dict, output_dir: str | Path) -> Path:
    """Save report.json to the output directory."""
    path = Path(output_dir) / "report.json"
    with open(path, "w") as f:
        json.dump(report, f, indent=2)
    logger.info("Saved %s", path)
    return path
