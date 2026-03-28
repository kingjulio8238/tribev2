# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the license found in the
# LICENSE file in the root directory of this source tree.

"""Runtime optimizations for TRIBE v2 inference pipeline.

Apply optimizations by calling ``apply_optimizations()`` before running
the pipeline.  This monkey-patches the neuralset video extractor to use
FP16 inference, torch.compile, and other speed improvements.

Usage::

    from tribev2.optimize import apply_optimizations
    apply_optimizations()  # call once before model.predict()
"""

import logging
import typing as tp

import numpy as np
import torch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
#  Configuration
# ---------------------------------------------------------------------------

_APPLIED = False


def apply_optimizations(
    fp16: bool = True,
    compile_model: bool = True,
    compile_mode: str = "reduce-overhead",
    matmul_precision: str = "high",
    batch_timesteps: int = 1,
) -> None:
    """Patch neuralset extractors for faster inference.

    Parameters
    ----------
    fp16:
        Use float16 for V-JEPA2 and text models.
    compile_model:
        Apply ``torch.compile`` to the video encoder.
    compile_mode:
        torch.compile mode (``"reduce-overhead"`` uses CUDA graphs).
    matmul_precision:
        Float32 matmul precision (``"high"`` enables TF32 on Ampere+).
    batch_timesteps:
        Number of timesteps to batch together for video encoding.
        Values > 1 require more GPU memory but improve throughput.
    """
    global _APPLIED
    if _APPLIED:
        logger.info("Optimizations already applied, skipping.")
        return
    _APPLIED = True

    # Set global matmul precision for TF32
    torch.set_float32_matmul_precision(matmul_precision)
    logger.info("Set float32 matmul precision to '%s'", matmul_precision)

    _patch_video_model_init(fp16=fp16, compile_model=compile_model, compile_mode=compile_mode)
    _patch_video_encoding_loop(batch_timesteps=batch_timesteps)
    _patch_text_model(fp16=fp16)

    logger.info(
        "Optimizations applied: fp16=%s, compile=%s (mode=%s), batch_timesteps=%d",
        fp16, compile_model, compile_mode, batch_timesteps,
    )


# ---------------------------------------------------------------------------
#  Patch 1: V-JEPA2 model init — add FP16 + torch.compile + no_grad
# ---------------------------------------------------------------------------

def _patch_video_model_init(
    fp16: bool, compile_model: bool, compile_mode: str
) -> None:
    """Patch _HFVideoModel.__init__ to add FP16, compile, and no_grad."""
    from neuralset.extractors.video import _HFVideoModel

    _original_init = _HFVideoModel.__init__

    def _optimized_init(
        self: tp.Any,
        model_name: str,
        pretrained: bool = True,
        layer_type: str = "",
        num_frames: int | None = None,
    ) -> None:
        _original_init(self, model_name, pretrained, layer_type, num_frames)

        # Only optimize V-JEPA2
        if "vjepa2" not in model_name.lower():
            return

        # FP16
        if fp16 and torch.cuda.is_available():
            self.model = self.model.half()
            logger.info("V-JEPA2: converted to FP16")

        # Disable gradients
        self.model.requires_grad_(False)
        logger.info("V-JEPA2: disabled gradients")

        # torch.compile
        if compile_model and torch.cuda.is_available():
            try:
                self.model = torch.compile(
                    self.model, backend="inductor", mode=compile_mode
                )
                logger.info("V-JEPA2: compiled with mode='%s'", compile_mode)
            except Exception as e:
                logger.warning("V-JEPA2: torch.compile failed (%s), skipping", e)

    _HFVideoModel.__init__ = _optimized_init


# ---------------------------------------------------------------------------
#  Patch 2: V-JEPA2 predict — ensure FP16 inputs
# ---------------------------------------------------------------------------

def _patch_video_encoding_loop(batch_timesteps: int) -> None:
    """Patch _HFVideoModel.predict to cast inputs to model dtype."""
    from neuralset.extractors.video import _HFVideoModel

    _original_predict = _HFVideoModel.predict

    def _optimized_predict(
        self: tp.Any, images: np.ndarray, audio: tp.Any | None = None
    ) -> tp.Any:
        # Call original to build inputs via processor
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

        # Fix NaN pixel values (from original code)
        from neuralset.extractors.video import _fix_pixel_values
        _fix_pixel_values(inputs)

        inputs = inputs.to(self.model.device)

        # Cast inputs to model dtype (FP16 if model is half)
        model_dtype = next(self.model.parameters()).dtype
        if model_dtype == torch.float16:
            for key in inputs:
                if isinstance(inputs[key], torch.Tensor) and inputs[key].is_floating_point():
                    inputs[key] = inputs[key].half()

        with torch.inference_mode():
            pred = self.model(**inputs)
        return pred

    _HFVideoModel.predict = _optimized_predict


# ---------------------------------------------------------------------------
#  Patch 3: Text model — FP16 for LLaMA
# ---------------------------------------------------------------------------

def _patch_text_model(fp16: bool) -> None:
    """Patch HuggingFaceText to load in FP16."""
    if not fp16:
        return

    try:
        from neuralset.extractors.text import HuggingFaceText

        _original_prepare = HuggingFaceText.prepare

        def _optimized_prepare(self: tp.Any, events: tp.Any) -> tp.Any:
            result = _original_prepare(self, events)
            # After prepare, if model exists, convert to half
            if hasattr(self, '_model') and self._model is not None:
                if torch.cuda.is_available():
                    self._model = self._model.half()
                    self._model.requires_grad_(False)
                    logger.info("LLaMA text model: converted to FP16")
            return result

        HuggingFaceText.prepare = _optimized_prepare
    except (ImportError, AttributeError) as e:
        logger.warning("Could not patch text model: %s", e)


# ---------------------------------------------------------------------------
#  Utility: pre-fetch fsaverage5 mesh data
# ---------------------------------------------------------------------------

def prefetch_fsaverage5() -> None:
    """Download fsaverage5 data so mesh export doesn't block on network I/O."""
    from nilearn.datasets import fetch_surf_fsaverage
    fetch_surf_fsaverage("fsaverage5")
    logger.info("Pre-fetched fsaverage5 mesh data")
