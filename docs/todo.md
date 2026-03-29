# TODO

## 1. Share URL Infrastructure (next)

- [ ] Deploy viewer as static site (Vercel/Netlify)
- [ ] Upload viewer_data to cloud storage per share ID
- [ ] Shareable URL: `https://viewer-host/?demo={share_id}`
- [ ] Share button in viewer copies URL to clipboard
- [ ] Support sharing both brain view and report view

## 2. Production API + A/B Testing

- [ ] FastAPI with persistent model loading (warm models in GPU memory)
- [ ] Async job queue for video processing
- [ ] Multi-demo viewer support (upload → process → view)
- [ ] A/B comparison view: side-by-side brain + emotion + report for two video variants
- [ ] See `docs/MULTIPLE_VIDS.md` for full architecture

## 3. AutoResearch Pipeline

- [ ] Autonomous research loop that iterates on video creative based on brain/emotion feedback
- [ ] Takes video + brief + report → proposes modifications grounded in brain insights
- [ ] Generates variants or prompts for them
- [ ] Re-runs pipeline on variants, compares results automatically
- [ ] Iterates until objectives are met
- [ ] Inspired by [autoresearch](https://github.com/karpathy/autoresearch)

## Completed

- [x] Encoding speed optimizations: 40.6 min → 4.7 min on A100 (8.69x). See `docs/OPTIMIZATIONS.md` and `docs/BENCHMARK_LOG.md`
- [x] Emotion analysis via Groq (6 emotions mapped from brain lobe activations)
- [x] Effectiveness report via Groq (score, emotional arc, key moments, brain insights, recommendations)
- [x] Full-screen report mode with expandable key moment previews (video + brain snapshot + mini bar charts)
- [x] Google Drive video input in Colab notebook
- [x] Pre-convert .mov/large files to compressed mp4 before pipeline
- [x] Multiple demo support (Sintel + Bud Light)
