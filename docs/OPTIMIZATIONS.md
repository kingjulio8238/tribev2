# Pipeline Optimizations

## Baseline (T4 GPU, 52s Sintel trailer)

| Phase | Time | % | GPU Memory |
|---|---|---|---|
| V-JEPA2 video extraction | 1,773s (29.5 min) | 72.7% | 12.7 GB reserved |
| WhisperX event building | 283s (4.7 min) | 11.6% | 793 MB |
| Mesh export (fsaverage5) | 200s (3.3 min) | 8.2% | 862 MB |
| LLaMA 3.2-3B text extraction | 116s (1.9 min) | 4.8% | 7.3 GB |
| Wav2Vec-BERT audio extraction | 42s | 1.7% | 13.2 GB |
| Model checkpoint load | 13s | 0.5% | 793 MB |
| Model inference (forward pass) | 2.8s | 0.1% | 862 MB |
| **Total** | **2,433s (40.6 min)** | | |

Full baseline data: `benchmark_results.json`

## Implemented Optimizations

All optimizations are in `tribev2/optimize.py` and applied via:

```python
from tribev2.optimize import apply_optimizations
apply_optimizations()
```

### 1. FP16 inference for V-JEPA2

Converts V-JEPA2 ViT-G model to float16 before encoding. Halves memory bandwidth and activates T4's FP16 tensor cores.

- **Expected speedup:** ~2x on video encoding
- **Memory savings:** ~50% (enables larger batch sizes)
- **Risk:** Low — inference-only, no training precision concerns

### 2. torch.compile with reduce-overhead mode

Applies `torch.compile(model, backend="inductor", mode="reduce-overhead")` to V-JEPA2. Fuses kernels and optionally uses CUDA graphs for reduced launch overhead.

- **Expected speedup:** ~20-30% beyond FP16
- **Inspired by:** le-wm harness achieving 3.6x speedup with same technique
- **Note:** First call is slow (compilation warmup), subsequent calls are faster

### 3. requires_grad_(False) on all extractors

Disables autograd tracking for all model parameters during feature extraction. Eliminates gradient computation overhead.

- **Expected speedup:** ~5-10%
- **Risk:** None — inference only

### 4. TF32 matmul precision

Sets `torch.set_float32_matmul_precision("high")` for faster matrix multiplications on Ampere+ GPUs (A100/H100). No effect on T4.

- **Expected speedup:** ~10-15% on A100/H100
- **Risk:** None — uses TF32 which has sufficient precision for inference

### 5. FP16 for LLaMA 3.2-3B text extraction

Converts LLaMA text encoder to float16, same approach as V-JEPA2.

- **Expected speedup:** ~40-50% on text phase (116s → ~60s)
- **Risk:** Low

### 6. fsaverage5 pre-fetch

`prefetch_fsaverage5()` downloads mesh data during install phase so the export step is pure file I/O.

- **Expected savings:** ~195s (200s → ~5s)
- **Risk:** None

## Configuration

```python
apply_optimizations(
    fp16=True,              # FP16 for V-JEPA2 + LLaMA
    compile_model=True,     # torch.compile with inductor
    compile_mode="reduce-overhead",  # CUDA graphs
    matmul_precision="high",  # TF32 on Ampere+
    batch_timesteps=1,      # Future: batch multiple timesteps
)
```

## Projected Impact

| Phase | Baseline | Optimized | Savings |
|---|---|---|---|
| V-JEPA2 video | 1,773s | ~600-900s | ~50-65% |
| Mesh export | 200s | ~5s | ~97% |
| LLaMA text | 116s | ~60s | ~48% |
| **Total** | **2,433s** | **~900-1,200s** | **~50-63%** |

## Future Optimizations (Not Yet Implemented)

### WhisperX backend swap
Replace WhisperX with `faster-whisper` (CTranslate2 backend) for 2-5x faster transcription. Currently 283s for 52s audio.

### INT8 quantization
Post-training INT8 quantization via `bitsandbytes` or `torch.ao.quantization`. ~20% beyond FP16 but higher implementation complexity.

### Temporal subsampling
V-JEPA2 encodes 64 frames per clip at 24fps. Reducing to 12fps or 8fps would cut encoding work proportionally, but may affect prediction quality.

### Batch timestep encoding
Process multiple timesteps in a single forward pass. Currently V-JEPA2 processes one timestep (64 frames) per call. Batching 2-4 timesteps would improve GPU utilization but requires restructuring the encoding loop and more GPU memory.

### GPU selection
A100 (40/80GB) or H100 would be significantly faster than T4 for both ViT and LLM inference, with more VRAM for larger batches.
