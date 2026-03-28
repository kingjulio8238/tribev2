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
