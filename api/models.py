"""ModelManager — singleton that keeps all models warm in GPU memory.

Loads once at server startup. All requests reuse the same model instances,
eliminating ~20s of model loading per request.

Usage::

    manager = ModelManager.get()
    manager.predict(video_path, brief, groq_key)
"""

import gc
import logging
import threading
from pathlib import Path

import torch

logger = logging.getLogger(__name__)

_instance: "ModelManager | None" = None
_lock = threading.Lock()


class ModelManager:
    """Singleton that manages warm model instances."""

    def __init__(self, cache_dir: str = "./cache", mesh_dir: str = "./mesh_cache"):
        from tribev2.demo_utils import TribeModel
        from tribev2.optimize import apply_optimizations, pregenerate_mesh

        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.mesh_dir = Path(mesh_dir)

        # Apply all pipeline optimizations
        logger.info("Applying optimizations...")
        self.opt_info = apply_optimizations(num_frames=32, compile_model=True)

        # Pre-generate mesh
        logger.info("Pre-generating mesh...")
        pregenerate_mesh(str(self.mesh_dir))

        # Load TRIBE v2 model
        logger.info("Loading TribeModel...")
        self.model = TribeModel.from_pretrained(
            "facebook/tribev2",
            cache_folder=str(self.cache_dir),
            device="auto",
        )
        logger.info("ModelManager initialized. GPU: %s", self.opt_info.get("gpu_name", "unknown"))

    @classmethod
    def get(cls, **kwargs) -> "ModelManager":
        """Get or create the singleton instance (thread-safe)."""
        global _instance
        if _instance is None:
            with _lock:
                if _instance is None:
                    _instance = cls(**kwargs)
        return _instance

    @classmethod
    def is_loaded(cls) -> bool:
        """Check if models are loaded."""
        return _instance is not None

    def get_device(self) -> str:
        """Return the device string."""
        if self.model._model is not None:
            return str(self.model._model.device)
        return "cuda" if torch.cuda.is_available() else "cpu"

    def free_gpu_for_extraction(self):
        """Move brain model to CPU to free GPU for feature extractors."""
        if self.model._model is not None:
            self.model._model.cpu()
            gc.collect()
            torch.cuda.empty_cache()
            logger.info("Brain model moved to CPU for extraction")

    def restore_gpu_for_inference(self):
        """Move brain model back to GPU for inference."""
        if self.model._model is not None and torch.cuda.is_available():
            self.model._model.cuda()
            logger.info("Brain model restored to GPU")
