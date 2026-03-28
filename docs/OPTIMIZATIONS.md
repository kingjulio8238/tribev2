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

## v5 — Production Optimizations

**Status: Implemented, pending benchmark**

### 10. Pre-bundled mesh

The fsaverage5 brain mesh is identical for every video. Pre-generated once in the benchmark utilities cell and copied during export instead of downloading.
- **Expected:** 58s → <1s
- **Risk:** None

### 11. faster-whisper (replaces WhisperX)

Replaced the `uvx whisperx` subprocess call with `faster-whisper` library (CTranslate2 backend). Uses the same `large-v3` model weights with optimized inference.
- **Expected:** 109s → ~15-20s (5-7x faster)
- **Risk:** Low — same model, optimized runtime

### 12. Parallel text + audio extraction

Text (LLaMA) and audio (Wav2Vec-BERT) extraction are independent. Run concurrently via ThreadPoolExecutor instead of sequentially.
- **Expected:** max(24s, 10s) = ~24s instead of 24s + 10s = 34s
- **Risk:** Low — A100 has plenty of VRAM for both models

### Projected v5 impact (A100)

| Phase | A100 v3 | v5 (projected) |
|---|---|---|
| WhisperX → faster-whisper | 109s | ~15-20s |
| Mesh export → pre-bundled | 58s | <1s |
| Text + Audio (parallel) | 34s | ~24s |
| V-JEPA2 video | 203s | 203s |
| **Total** | **414s (6.9 min)** | **~250s (4.2 min)** |

## Future Optimizations (Not Yet Implemented)

### Batch timestep encoding
Process multiple timesteps in a single forward pass. Requires restructuring the neuralset encoding loop.

### INT8 quantization
Post-training INT8 via `bitsandbytes` or `torch.ao.quantization`. ~20% beyond FP16.

### H100 GPU
H100 has ~2x the compute of A100. Would bring V-JEPA2 to ~1s/frame.
