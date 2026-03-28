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
**GPU:** Tesla T4
**Optimizations:** FP16 inference, torch.compile (reduce-overhead), requires_grad_(False), TF32 matmul, fsaverage5 prefetch

| Phase | Time | % | vs v0 |
|---|---|---|---|
| Feature extraction: video (V-JEPA2) | TBD | | |
| Feature extraction: text (LLaMA 3.2-3B) | TBD | | |
| Export mesh | TBD | | |
| **Total** | **TBD** | | |

**Expected improvements:**
- V-JEPA2: ~50-65% faster (1,773s → ~600-900s)
- Mesh export: ~97% faster (200s → ~5s) via prefetch
- LLaMA text: ~48% faster (116s → ~60s) via FP16
- Total: ~50-63% faster (2,433s → ~900-1,200s)

*Results pending — run `colab_benchmark_pipeline.ipynb` with `ENABLE_OPTIMIZATIONS = True`*
