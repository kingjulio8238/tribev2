# TODO

## Viewer

- [ ] Add proper share functionality (screenshot export + shareable URL with encoded state). The `ExportControls` component exists at `viewer/src/components/ExportControls.tsx` but is currently disabled. It supports screenshot via canvas `toDataURL` and URL sharing with `?demo=&t=&view=` params. Needs UX polish before re-enabling.
- [ ] Improve encoding speed. V-JEPA2 video encoding is the bottleneck (~16s/frame on T4 GPU, ~25-30 min for a 52s video). Potential improvements: FP16/BF16 inference, larger batch sizes on higher-VRAM GPUs (A100/H100), INT8 quantization of feature extractors, smarter temporal subsampling, feature caching across runs. See `viewer/PERFORMANCE.md` for details.
