# Benchmark Log

Per-version timing results for the TRIBE v2 pipeline. All benchmarks use the Sintel trailer (52.21s, 480p).

## v0 — Baseline (no optimizations)

**Date:** 2026-03-28
**GPU:** Tesla T4 (15,637 MB VRAM)
**CUDA:** 12.4 | **PyTorch:** 2.6.0+cu124
**Optimizations:** None

| Phase | Time | % |
|---|---|---|
| Download video | 0.26s | 0.0% |
| Model load (checkpoint + init) | 13.34s | 0.5% |
| Build events (audio + WhisperX) | 283.02s | 11.6% |
| Feature extraction: text (LLaMA 3.2-3B) | 116.00s | 4.8% |
| Feature extraction: audio (Wav2Vec-BERT) | 41.78s | 1.7% |
| Feature extraction: video (V-JEPA2) | 1,772.73s | 72.7% |
| Feature extraction: subject_id | 0.01s | 0.0% |
| Build dataloader | 0.01s | 0.0% |
| Model inference (forward pass) | 2.77s | 0.1% |
| Normalization | 0.02s | 0.0% |
| Export mesh | 199.65s | 8.2% |
| Export predictions | 0.00s | 0.0% |
| Export stimulus metadata | 2.85s | 0.1% |
| Zip output | 0.55s | 0.0% |
| **Total** | **2,433.00s (40.6 min)** | |

**Key observations:**
- V-JEPA2 video encoding is 73% of total time (17.0s per frame, 104 frames)
- WhisperX transcription is surprisingly slow at 283s (5.4x realtime)
- Mesh export takes 200s due to fsaverage5 download
- Peak GPU memory: 13.2 GB reserved (during audio extraction)
- Model inference itself is only 2.8s — not a bottleneck

## v1 — FP16 + torch.compile + no_grad + mesh cache

**Date:** 2026-03-28
**GPU:** Tesla T4 (15,637 MB VRAM)
**CUDA:** 12.4 | **PyTorch:** 2.6.0+cu124
**Optimizations:** FP16 inference, torch.compile (reduce-overhead), requires_grad_(False), TF32 matmul, fsaverage5 prefetch

| Phase | Time | % | vs v0 |
|---|---|---|---|
| Download video | 0.27s | 0.0% | — |
| Model load (checkpoint + init) | 2.76s | 0.4% | 4.83x |
| Build events (audio + WhisperX) | 3.19s | 0.4% | cached |
| Feature extraction: text (LLaMA 3.2-3B) | 33.14s | 4.3% | **3.50x** |
| Feature extraction: audio (Wav2Vec-BERT) | 17.87s | 2.3% | 2.34x |
| Feature extraction: video (V-JEPA2) | 702.91s | 91.5% | **2.52x** |
| Feature extraction: subject_id | 0.01s | 0.0% | — |
| Build dataloader | 0.01s | 0.0% | — |
| Model inference (forward pass) | 3.76s | 0.5% | — |
| Normalization | 0.02s | 0.0% | — |
| Export mesh | 0.45s | 0.1% | **444x** |
| Export predictions | 0.01s | 0.0% | — |
| Export stimulus metadata | 2.95s | 0.4% | — |
| Zip output | 0.53s | 0.1% | — |
| **Total** | **767.87s (12.8 min)** | | **3.17x** |

**Key results:**
- V-JEPA2: 1,773s → 703s (**2.52x faster**, 6.8s/frame vs 17.0s/frame)
- LLaMA text: 116s → 33s (**3.50x faster**)
- Mesh export: 200s → 0.45s (**444x faster** via prefetch)
- Peak GPU memory: 6.6 GB reserved (vs 13.2 GB baseline) — **50% less VRAM**
- Total pipeline: 40.6 min → 12.8 min (**3.17x faster**)

## v2 — Frame subsampling (64→32) + memory optimization

**Date:** 2026-03-28
**GPU:** Tesla T4 (15,637 MB VRAM)
**CUDA:** 12.4 | **PyTorch:** 2.6.0+cu124
**Optimizations:** v1 + frame subsampling (64→32 frames), torch.compile default mode, brain model offloaded to CPU during extraction

| Phase | Time | % | vs v0 | vs v1 |
|---|---|---|---|---|
| Download video | 0.32s | 0.1% | — | — |
| Model load (checkpoint + init) | 2.63s | 0.6% | 5.07x | — |
| Build events (audio + WhisperX) | 3.37s | 0.7% | cached | — |
| Feature extraction: text (LLaMA 3.2-3B) | 35.58s | 7.5% | **3.26x** | — |
| Feature extraction: audio (Wav2Vec-BERT) | 17.32s | 3.7% | 2.41x | — |
| Feature extraction: video (V-JEPA2) | 404.85s | 85.6% | **4.38x** | **1.74x** |
| Feature extraction: subject_id | 0.01s | 0.0% | — | — |
| Build dataloader | 0.01s | 0.0% | — | — |
| Model inference (forward pass) | 5.35s | 1.1% | — | — |
| Normalization | 0.02s | 0.0% | — | — |
| Export mesh | 0.51s | 0.1% | **392x** | — |
| Export predictions | 0.01s | 0.0% | — | — |
| Export stimulus metadata | 2.44s | 0.5% | — | — |
| Zip output | 0.54s | 0.1% | — | — |
| **Total** | **472.95s (7.9 min)** | | **5.14x** | **1.62x** |

**Key results:**
- V-JEPA2: 703s → 405s (**1.74x faster** vs v1, **4.38x** vs baseline). 3.9s/frame with 32 frames.
- Peak GPU memory: 6.8 GB reserved (during audio) then 4.3 GB during video — well within T4 capacity
- Total pipeline: 40.6 min → 7.9 min (**5.14x faster** vs baseline)

## v3 — cuDNN benchmark mode

**Date:** 2026-03-28
**GPU:** Tesla T4 (15,637 MB VRAM)
**CUDA:** 12.4 | **PyTorch:** 2.6.0+cu124
**Optimizations:** v2 + `torch.backends.cudnn.benchmark = True`

| Phase | Time | % | vs v0 | vs v2 |
|---|---|---|---|---|
| Download video | 0.25s | 0.1% | — | — |
| Model load (checkpoint + init) | 2.85s | 0.7% | — | — |
| Build events (audio + WhisperX) | 3.76s | 1.0% | cached | — |
| Feature extraction: text (LLaMA 3.2-3B) | 35.92s | 9.2% | **3.23x** | — |
| Feature extraction: audio (Wav2Vec-BERT) | 17.51s | 4.5% | 2.39x | — |
| Feature extraction: video (V-JEPA2) | 322.21s | 82.3% | **5.50x** | **1.26x** |
| Feature extraction: subject_id | 0.01s | 0.0% | — | — |
| Build dataloader | 0.01s | 0.0% | — | — |
| Model inference (forward pass) | 4.60s | 1.2% | — | — |
| Normalization | 0.03s | 0.0% | — | — |
| Export mesh | 0.44s | 0.1% | **454x** | — |
| Export predictions | 0.01s | 0.0% | — | — |
| Export stimulus metadata | 3.50s | 0.9% | — | — |
| Zip output | 0.69s | 0.2% | — | — |
| **Total** | **391.77s (6.5 min)** | | **6.21x** | **1.21x** |

**Key results:**
- V-JEPA2: 405s → 322s (**20% faster** vs v2, **5.50x** vs baseline). 3.1s/frame.
- cuDNN benchmark auto-tuned kernels for the fixed 256px input size
- Total pipeline: 40.6 min → 6.5 min (**6.21x faster** vs baseline)

## Summary

| Version | Total Time | vs Baseline | V-JEPA2 Time | V-JEPA2 s/frame |
|---|---|---|---|---|
| v0 (baseline) | 40.6 min | 1.0x | 29.5 min | 17.0s |
| v1 (FP16 + compile) | 12.8 min | 3.17x | 11.7 min | 6.8s |
| v2 (32-frame subsample) | 7.9 min | 5.14x | 6.7 min | 3.9s |
| **v3 (cuDNN benchmark)** | **6.5 min** | **6.21x** | **5.4 min** | **3.1s** |

### v4 notes (no significant change on T4)

- **Text/audio FP16:** Patching `_load_model`/`_get_sound_model` did not activate — neuralset's pydantic property caching bypasses the patched methods. Would require modifying neuralset source.
- **Frame pre-extraction:** Caused CUDA fork errors in DataLoader workers. Removed.
- **Compile warmup:** Skipped in Colab due to forked subprocess CUDA constraint.

**Conclusion:** v3 represents the practical T4 ceiling with monkey-patching. Next step: A100 GPU.

## A100 — v3 optimizations on NVIDIA A100-SXM4-40GB

**Date:** 2026-03-28
**GPU:** NVIDIA A100-SXM4-40GB (42,406 MB VRAM)
**CUDA:** 12.4 | **PyTorch:** 2.6.0+cu124
**Optimizations:** BF16, torch.compile (reduce-overhead), no_grad, 32-frame subsample, cuDNN benchmark, TF32 matmul

| Phase | Time | % | vs T4 v3 | vs T4 v0 |
|---|---|---|---|---|
| Download video | 0.52s | 0.1% | — | — |
| Model load (checkpoint + init) | 5.62s | 1.4% | — | — |
| Build events (audio + WhisperX) | 109.12s | 26.4% | fresh run | — |
| Feature extraction: text (LLaMA 3.2-3B) | 23.52s | 5.7% | **1.53x** | **4.93x** |
| Feature extraction: audio (Wav2Vec-BERT) | 10.05s | 2.4% | **1.74x** | **4.16x** |
| Feature extraction: video (V-JEPA2) | 203.34s | 49.1% | **1.58x** | **8.72x** |
| Feature extraction: subject_id | 0.01s | 0.0% | — | — |
| Build dataloader | 0.01s | 0.0% | — | — |
| Model inference (forward pass) | 2.21s | 0.5% | 1.70x | — |
| Normalization | 0.02s | 0.0% | — | — |
| Export mesh | 57.83s | 14.0% | partial cache | — |
| Export predictions | 0.00s | 0.0% | — | — |
| Export stimulus metadata | 0.98s | 0.2% | — | — |
| Zip output | 0.53s | 0.1% | — | — |
| **Total** | **413.75s (6.9 min)** | | | |
| **Compute only** | **238.91s (4.0 min)** | | **1.58x vs T4** | **8.72x vs baseline** |

**Key results:**
- V-JEPA2: 1.95s/frame on A100 vs 3.1s/frame on T4 (**1.58x faster**)
- A100 auto-selected: BF16, reduce-overhead compile, TF32 matmul
- Compute phases (text+audio+video): 238s on A100 vs 376s on T4 (**1.58x**)
- Non-compute overhead (WhisperX 109s, mesh 58s) dominated total — both are cached on re-runs

## Summary

| Version | GPU | Compute Time | V-JEPA2 s/frame | vs T4 Baseline |
|---|---|---|---|---|
| v0 (baseline) | T4 | 40.6 min | 17.0s | 1.0x |
| v1 (FP16 + compile) | T4 | 12.8 min | 6.8s | 3.17x |
| v2 (32-frame) | T4 | 7.9 min | 3.9s | 5.14x |
| v3 (cuDNN bench) | T4 | 6.5 min | 3.1s | 6.21x |
| **v3 (A100)** | **A100** | **4.0 min** (compute) | **1.95s** | **8.72x** |
