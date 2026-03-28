# Performance Notes

## Encoding Speed

The current Colab export pipeline takes ~25-30 minutes for a 52-second video on a T4 GPU. The bottleneck is V-JEPA2 video feature extraction (~16s per frame batch).

There is significant room to improve encoding speed:

- **Batch size tuning**: V-JEPA2 processes frames sequentially; larger batch sizes on higher-VRAM GPUs would help
- **FP16 / BF16 inference**: The feature extractors currently run in FP32; half-precision would roughly halve encoding time
- **Frame subsampling**: The model extracts at 2Hz but encodes all 24fps frames; smarter temporal sampling could reduce work
- **Model quantization**: INT8 quantization of the feature extractors (especially LLaMA 3.2-3B) would reduce both memory and compute
- **Caching**: Extracted features could be cached and reused across runs for the same input
- **GPU selection**: A100/H100 would be significantly faster than T4 for both the ViT (V-JEPA2) and LLM (LLaMA) forward passes
