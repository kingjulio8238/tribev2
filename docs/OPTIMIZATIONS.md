# Pipeline Optimizations

## Baseline — v0 (T4 GPU, 52s Sintel trailer)

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

---

## v1 — FP16 + torch.compile + no_grad + mesh cache

**Result: 2,433s → 768s (3.17x faster)**

| Phase | v0 | v1 | Speedup |
|---|---|---|---|
| V-JEPA2 video | 1,773s | 703s | 2.52x |
| LLaMA text | 116s | 33s | 3.50x |
| Wav2Vec audio | 42s | 18s | 2.33x |
| Mesh export | 200s | 0.45s | 444x |
| GPU memory (peak) | 13.2 GB | 6.6 GB | 50% less |

### Optimizations applied

1. **FP16 inference for V-JEPA2** — `model.half()` before encoding. Halves memory bandwidth, activates T4 FP16 tensor cores.
2. **torch.compile (reduce-overhead)** — `torch.compile(model, backend="inductor", mode="reduce-overhead")` for kernel fusion and CUDA graphs. Inspired by le-wm harness (3.6x predictor speedup).
3. **requires_grad_(False)** — Disables autograd on all extractor models.
4. **TF32 matmul precision** — `torch.set_float32_matmul_precision("high")` for Ampere+ GPUs.
5. **FP16 for LLaMA text** — Same half-precision approach for text encoder.
6. **fsaverage5 prefetch** — Downloads mesh data during install so export is pure I/O.

Full data: `benchmark_results_optimized.json`

---

## v2 — Frame subsampling + audio FP16 + text compile

**Status: Implemented, pending benchmark**

### New optimizations

7. **V-JEPA2 frame subsampling (64 → 32 frames)** — Reduces per-timestep compute by ~50%. V-JEPA2's processor handles variable frame counts via position embedding interpolation.
   - Expected: 703s → ~350-450s
   - Risk: Medium — may affect prediction quality, needs comparison

8. **Brain model CPU offload** — Moves tribev2 brain model to CPU during feature extraction to free ~710 MB GPU for extractors.

9. **torch.compile default mode** — Switched from `reduce-overhead` to `default` mode. The `reduce-overhead` mode allocates persistent CUDA graph pools that cause OOM for subsequent extractors on T4.

### Actual v2 results

| Phase | v1 | v2 | Speedup |
|---|---|---|---|
| V-JEPA2 video | 703s | **405s** | **1.74x** |
| LLaMA text | 33s | 36s | — |
| Wav2Vec audio | 18s | 17s | — |
| **Total** | **768s (12.8 min)** | **473s (7.9 min)** | **1.62x** |
| **vs baseline** | 3.17x | **5.14x** | |

**Note:** Audio FP16 and text torch.compile were removed from v2 due to OOM on T4. These would help on higher-VRAM GPUs (A100/H100).

### Configuration

```python
# In the benchmark notebook optimization cell:
ENABLE_OPTIMIZATIONS = True
VJEPA2_NUM_FRAMES = 32  # 64 = default, 32 = subsampled
```

---

## Future Optimizations (Not Yet Implemented)

### Batch timestep encoding
Process multiple timesteps in a single forward pass. Currently V-JEPA2 processes one timestep per call. Batching 2-4 timesteps would improve GPU utilization but requires restructuring the neuralset encoding loop.

### WhisperX backend swap
Replace WhisperX with `faster-whisper` (CTranslate2 backend) for 2-5x faster transcription.

### INT8 quantization
Post-training INT8 via `bitsandbytes` or `torch.ao.quantization`. ~20% beyond FP16.

### GPU selection
A100 (40/80GB) or H100 would be significantly faster than T4, with more VRAM for larger batches.
