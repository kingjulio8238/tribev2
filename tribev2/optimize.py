# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the license found in the
# LICENSE file in the root directory of this source tree.

"""Runtime optimizations for TRIBE v2 inference pipeline.

Applies monkey-patches to neuralset extractors for faster inference.
All optimizations are applied via a single call::

    from tribev2.optimize import apply_optimizations
    apply_optimizations()

This must be called BEFORE running the pipeline (before model.predict()).
"""

import logging
import typing as tp

import numpy as np
import torch

logger = logging.getLogger(__name__)

_APPLIED = False

# Re-entrancy guard for __init__ patching
_in_init = False


def apply_optimizations(
    num_frames: int = 32,
    compile_model: bool = True,
    cudnn_benchmark: bool = True,
    matmul_precision: str = "high",
) -> dict[str, tp.Any]:
    """Apply all pipeline optimizations. Call once before inference.

    Auto-detects GPU capabilities:
    - BF16 on Ampere+ (A100/H100), FP16 on older (T4)
    - reduce-overhead compile mode on high-VRAM GPUs, default on T4

    Parameters
    ----------
    num_frames:
        Number of frames per V-JEPA2 clip. Default 32 (subsampled from 64).
    compile_model:
        Apply torch.compile to V-JEPA2 encoder.
    cudnn_benchmark:
        Enable cuDNN auto-tuning for fixed input sizes.
    matmul_precision:
        Float32 matmul precision ('high' enables TF32 on Ampere+).

    Returns
    -------
    dict with detected GPU info and applied settings.
    """
    global _APPLIED
    if _APPLIED:
        logger.info("Optimizations already applied, skipping.")
        return {}
    _APPLIED = True

    # Global settings
    torch.set_float32_matmul_precision(matmul_precision)
    if cudnn_benchmark:
        torch.backends.cudnn.benchmark = True

    # Auto-detect GPU
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    vram_gb = torch.cuda.get_device_properties(0).total_memory / 1e9 if torch.cuda.is_available() else 0
    is_ampere_plus = torch.cuda.is_available() and torch.cuda.get_device_capability(0)[0] >= 8
    high_vram = vram_gb > 20

    dtype = torch.bfloat16 if is_ampere_plus else torch.float16
    dtype_name = "BF16" if is_ampere_plus else "FP16"
    compile_mode = "reduce-overhead" if high_vram else "default"

    info = {
        "gpu_name": gpu_name,
        "vram_gb": round(vram_gb, 1),
        "dtype": dtype_name,
        "compile_mode": compile_mode if compile_model else "disabled",
        "num_frames": num_frames,
        "cudnn_benchmark": cudnn_benchmark,
    }

    logger.info("GPU: %s (%.0f GB), dtype: %s, compile: %s", gpu_name, vram_gb, dtype_name, compile_mode)

    # Apply patches
    _patch_video_model(dtype=dtype, compile_model=compile_model, compile_mode=compile_mode, num_frames=num_frames)
    _patch_video_predict(dtype=dtype)
    _patch_whisper()

    logger.info("All optimizations applied: %s", info)
    return info


# ---------------------------------------------------------------------------
#  Patch 1: V-JEPA2 model init — dtype + compile + no_grad + subsampling
# ---------------------------------------------------------------------------

def _patch_video_model(
    dtype: torch.dtype, compile_model: bool, compile_mode: str, num_frames: int,
) -> None:
    from neuralset.extractors.video import _HFVideoModel

    if getattr(_HFVideoModel, '_optimized', False):
        return

    _HFVideoModel._original_init = _HFVideoModel.__init__

    def _patched_init(
        self: tp.Any,
        model_name: str,
        pretrained: bool = True,
        layer_type: str = "",
        num_frames_arg: int | None = None,
    ) -> None:
        global _in_init
        if _in_init:
            return _HFVideoModel._original_init(self, model_name, pretrained, layer_type, num_frames_arg)

        _in_init = True
        try:
            # Override num_frames for V-JEPA2
            if "vjepa2" in model_name.lower() and num_frames_arg is None:
                num_frames_arg = num_frames
                logger.info("V-JEPA2: subsampling to %d frames (from 64)", num_frames)

            _HFVideoModel._original_init(self, model_name, pretrained, layer_type, num_frames_arg)

            if "vjepa2" in model_name.lower() and torch.cuda.is_available():
                self.model = self.model.to(dtype)
                self.model.requires_grad_(False)
                logger.info("V-JEPA2: %s + no_grad applied", "BF16" if dtype == torch.bfloat16 else "FP16")

                if compile_model:
                    try:
                        self.model = torch.compile(self.model, backend="inductor", mode=compile_mode)
                        logger.info("V-JEPA2: torch.compile (%s) applied", compile_mode)
                    except Exception as e:
                        logger.warning("V-JEPA2: torch.compile skipped (%s)", e)
        finally:
            _in_init = False

    _HFVideoModel.__init__ = _patched_init
    _HFVideoModel._optimized = True


# ---------------------------------------------------------------------------
#  Patch 2: V-JEPA2 predict — cast inputs to model dtype
# ---------------------------------------------------------------------------

def _patch_video_predict(dtype: torch.dtype) -> None:
    from neuralset.extractors.video import _HFVideoModel, _fix_pixel_values

    if getattr(_HFVideoModel, '_predict_optimized', False):
        return

    _HFVideoModel._original_predict = _HFVideoModel.predict

    def _patched_predict(
        self: tp.Any, images: np.ndarray, audio: tp.Any | None = None
    ) -> tp.Any:
        kwargs: dict[str, tp.Any] = {"text": "", "return_tensors": "pt"}
        field = "images"
        if "xclip" in self.model_name:
            field = "videos"
        elif "llava" in self.model_name.lower():
            field = "videos"
            kwargs["text"] = self.layer_type
        elif "vjepa2" in self.model_name:
            field = "videos"
            del kwargs["text"]
        elif "Phi-4" in self.model_name:
            import PIL
            images = [PIL.Image.fromarray(img) for img in images]
            field = "images"
            prompt = "<|user|>"
            for i in range(1, len(images) + 1):
                prompt += f"<|image_{i}|>"
            if audio is not None:
                kwargs["audios"] = [(audio.to_soundarray(), audio.fps)]
                prompt += "<|audio_1|>"
            prompt += "<|end|><|assistant|>"
            kwargs["text"] = prompt
        kwargs[field] = list(images)
        inputs = self.processor(**kwargs)
        _fix_pixel_values(inputs)
        inputs = inputs.to(self.model.device)

        # Cast inputs to model dtype
        model_dtype = next(self.model.parameters()).dtype
        if model_dtype in (torch.float16, torch.bfloat16):
            for key in inputs:
                if isinstance(inputs[key], torch.Tensor) and inputs[key].is_floating_point():
                    inputs[key] = inputs[key].to(model_dtype)

        with torch.inference_mode():
            pred = self.model(**inputs)
        return pred

    _HFVideoModel.predict = _patched_predict
    _HFVideoModel._predict_optimized = True


# ---------------------------------------------------------------------------
#  Patch 3: Replace WhisperX subprocess with faster-whisper
# ---------------------------------------------------------------------------

def _patch_whisper() -> None:
    """Replace the WhisperX subprocess call with faster-whisper."""
    try:
        from faster_whisper import WhisperModel  # noqa: F401
    except ImportError:
        logger.info("faster-whisper not installed, keeping WhisperX")
        return

    from tribev2.eventstransforms import ExtractWordsFromAudio
    import pandas as pd

    if getattr(ExtractWordsFromAudio, '_faster_whisper_patched', False):
        return

    @staticmethod
    def _fast_transcript(wav_filename: tp.Any, language: str) -> pd.DataFrame:
        from faster_whisper import WhisperModel as _WhisperModel
        language_codes = dict(english="en", french="fr", spanish="es", dutch="nl", chinese="zh")
        lang = language_codes.get(language, "en")

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "float32"

        model = _WhisperModel("large-v3", device=device, compute_type=compute_type)
        segments, _info = model.transcribe(
            str(wav_filename), language=lang, beam_size=5,
            word_timestamps=True, vad_filter=True,
        )
        words = []
        for i, segment in enumerate(segments):
            sentence = segment.text.replace('"', "").strip()
            if segment.words:
                for word in segment.words:
                    words.append({
                        "text": word.word.replace('"', "").strip(),
                        "start": word.start,
                        "duration": word.end - word.start,
                        "sequence_id": i,
                        "sentence": sentence,
                    })
        del model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        logger.info("faster-whisper: transcribed %d words", len(words))
        return pd.DataFrame(words)

    ExtractWordsFromAudio._get_transcript_from_audio = _fast_transcript
    ExtractWordsFromAudio._faster_whisper_patched = True
    logger.info("WhisperX replaced with faster-whisper (large-v3)")


# ---------------------------------------------------------------------------
#  Utility: pre-generate fsaverage5 mesh
# ---------------------------------------------------------------------------

def pregenerate_mesh(output_dir: str) -> None:
    """Pre-generate fsaverage5 mesh files for the viewer export."""
    import json
    from pathlib import Path
    import nibabel as nib
    from nilearn.datasets import fetch_surf_fsaverage

    out = Path(output_dir)
    if (out / "vertices.bin").exists():
        logger.info("Mesh cache exists at %s, skipping", out)
        return

    out.mkdir(parents=True, exist_ok=True)
    fsaverage = fetch_surf_fsaverage("fsaverage5")
    all_coords, all_faces, all_sulc = [], [], []
    vertex_offset = 0
    GAP = 3.0

    for hemi in ("left", "right"):
        pial = nib.load(getattr(fsaverage, f"pial_{hemi}")).darrays
        pial_coords, faces = pial[0].data, pial[1].data
        infl_coords = nib.load(getattr(fsaverage, f"infl_{hemi}")).darrays[0].data
        coords = 0.5 * pial_coords + 0.5 * infl_coords
        if hemi == "left":
            coords[:, 0] -= coords[:, 0].max() + GAP
        else:
            coords[:, 0] -= coords[:, 0].min() - GAP
        sulc = nib.load(getattr(fsaverage, f"sulc_{hemi}")).darrays[0].data
        all_coords.append(coords)
        all_faces.append(faces + vertex_offset)
        all_sulc.append(sulc)
        vertex_offset += coords.shape[0]

    vertices = np.concatenate(all_coords).astype(np.float32)
    faces_arr = np.concatenate(all_faces).astype(np.uint32)
    sulcal = np.concatenate(all_sulc).astype(np.float32)
    vertices.tofile(str(out / "vertices.bin"))
    faces_arr.tofile(str(out / "faces.bin"))
    sulcal.tofile(str(out / "sulcal_depth.bin"))

    # HCP parcellation
    try:
        from tribev2.utils import get_hcp_labels
        labels_dict = get_hcp_labels(mesh="fsaverage5", combine=False, hemi="both")
        roi_names = ["unknown"] + sorted(labels_dict.keys())
        roi_map = {n: i for i, n in enumerate(roi_names)}
        parc = np.zeros(vertices.shape[0], dtype=np.uint16)
        for name, verts in labels_dict.items():
            for v in verts:
                if v < parc.shape[0]:
                    parc[int(v)] = roi_map[name]
        parc.tofile(str(out / "parcellation.bin"))
        with open(out / "roi_names.json", "w") as f:
            json.dump(roi_names, f)
    except Exception as e:
        logger.warning("Parcellation skipped: %s", e)

    logger.info("Pre-generated mesh: %d vertices, %d faces at %s", vertices.shape[0], faces_arr.shape[0], out)


# ---------------------------------------------------------------------------
#  Utility: pre-convert video to compressed mp4
# ---------------------------------------------------------------------------

def preconvert_video(video_path: str, output_path: str | None = None) -> str:
    """Convert video to compressed H.264 mp4 if needed.

    Returns the path to the (possibly converted) video.
    """
    import subprocess
    from pathlib import Path

    src = Path(video_path)
    if output_path:
        dst = Path(output_path)
    else:
        dst = src.with_suffix(".mp4")

    # Skip if already a small mp4
    if src.suffix.lower() == ".mp4" and src.stat().st_size < 100 * 1e6:
        logger.info("Video already compressed mp4 (%d MB), skipping conversion", src.stat().st_size // 1e6)
        return str(src)

    logger.info("Pre-converting %s (%d MB) to compressed mp4...", src.name, src.stat().st_size // 1e6)
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-c:v", "libx264", "-crf", "23",
         "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(dst)],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        old_mb = src.stat().st_size / 1e6
        new_mb = dst.stat().st_size / 1e6
        logger.info("Converted: %.0f MB → %.0f MB (%.1fx smaller)", old_mb, new_mb, old_mb / new_mb)
        return str(dst)
    else:
        logger.warning("ffmpeg failed, using original: %s", result.stderr[:200])
        return str(src)
