/**
 * Fire colormap and heatmap blending utilities.
 *
 * The fire colormap approximates colorcet "fire":
 *   black -> dark red -> red-orange -> orange -> yellow-orange -> near-white
 */

// Colormap stops: [position, R, G, B]
const FIRE_STOPS: readonly [number, number, number, number][] = [
  [0.0, 0.0, 0.0, 0.0],
  [0.2, 0.35, 0.0, 0.0],
  [0.4, 0.75, 0.15, 0.0],
  [0.6, 0.95, 0.45, 0.05],
  [0.8, 1.0, 0.75, 0.2],
  [1.0, 1.0, 1.0, 0.85],
];

/**
 * Maps a scalar t in [0, 1] through the fire colormap.
 * Values outside [0, 1] are clamped.
 */
export function fireColormap(t: number): [number, number, number] {
  // Clamp
  if (t <= 0) return [FIRE_STOPS[0][1], FIRE_STOPS[0][2], FIRE_STOPS[0][3]];
  if (t >= 1) {
    const last = FIRE_STOPS[FIRE_STOPS.length - 1];
    return [last[1], last[2], last[3]];
  }

  // Find the two stops that bracket t
  for (let i = 0; i < FIRE_STOPS.length - 1; i++) {
    const [p0, r0, g0, b0] = FIRE_STOPS[i];
    const [p1, r1, g1, b1] = FIRE_STOPS[i + 1];
    if (t >= p0 && t <= p1) {
      const f = (t - p0) / (p1 - p0);
      return [
        r0 + (r1 - r0) * f,
        g0 + (g1 - g0) * f,
        b0 + (b1 - b0) * f,
      ];
    }
  }

  // Fallback (should not be reached)
  const last = FIRE_STOPS[FIRE_STOPS.length - 1];
  return [last[1], last[2], last[3]];
}

/**
 * Applies the fire heatmap on top of sulcal background colors, in-place.
 *
 * Algorithm:
 *  1. For each vertex, read the prediction value (already [0,1]).
 *  2. If value < vmin, keep the sulcal background color unchanged.
 *  3. Otherwise, remap value from [vmin, 1] -> [0, 1] for colormap lookup.
 *  4. Compute alpha: ramp from 0 to 1 over [0, alphaScale] in the remapped
 *     range, then clamp to 1.
 *  5. Blend: output = alpha * fire_color + (1 - alpha) * sulcal_color.
 *
 * @param outputColors  - Float32Array of length nVertices*3, written in-place
 * @param sulcalColors  - Float32Array of length nVertices*3, read-only base colors
 * @param values        - Float32Array of length nVertices, prediction values [0,1]
 * @param vmin          - threshold below which sulcal background is shown
 * @param alphaScale    - range in remapped space over which alpha ramps 0->1
 */
export function applyHeatmap(
  outputColors: Float32Array,
  sulcalColors: Float32Array,
  values: Float32Array,
  vmin: number,
  alphaScale: number,
): void {
  const nVertices = values.length;
  const invRange = vmin < 1 ? 1 / (1 - vmin) : 1;
  const invAlpha = alphaScale > 0 ? 1 / alphaScale : 1;

  for (let i = 0; i < nVertices; i++) {
    const v = values[i];

    if (v < vmin) {
      // Below threshold — keep sulcal colors
      const i3 = i * 3;
      outputColors[i3] = sulcalColors[i3];
      outputColors[i3 + 1] = sulcalColors[i3 + 1];
      outputColors[i3 + 2] = sulcalColors[i3 + 2];
      continue;
    }

    // Remap to [0, 1]
    const mapped = Math.min(1, (v - vmin) * invRange);

    // Compute alpha
    const alpha = mapped < alphaScale ? mapped * invAlpha : 1;

    // Look up fire color — inline for performance
    let fr: number, fg: number, fb: number;

    if (mapped <= 0) {
      fr = 0; fg = 0; fb = 0;
    } else if (mapped >= 1) {
      fr = 1; fg = 1; fb = 0.85;
    } else if (mapped < 0.2) {
      const f = mapped * 5; // (mapped - 0) / 0.2
      fr = 0.35 * f;
      fg = 0;
      fb = 0;
    } else if (mapped < 0.4) {
      const f = (mapped - 0.2) * 5;
      fr = 0.35 + 0.4 * f;
      fg = 0.15 * f;
      fb = 0;
    } else if (mapped < 0.6) {
      const f = (mapped - 0.4) * 5;
      fr = 0.75 + 0.2 * f;
      fg = 0.15 + 0.3 * f;
      fb = 0.05 * f;
    } else if (mapped < 0.8) {
      const f = (mapped - 0.6) * 5;
      fr = 0.95 + 0.05 * f;
      fg = 0.45 + 0.3 * f;
      fb = 0.05 + 0.15 * f;
    } else {
      const f = (mapped - 0.8) * 5;
      fr = 1.0;
      fg = 0.75 + 0.25 * f;
      fb = 0.2 + 0.65 * f;
    }

    // Alpha blend: output = alpha * fire + (1 - alpha) * sulcal
    const i3 = i * 3;
    const oneMinusAlpha = 1 - alpha;
    outputColors[i3] = alpha * fr + oneMinusAlpha * sulcalColors[i3];
    outputColors[i3 + 1] = alpha * fg + oneMinusAlpha * sulcalColors[i3 + 1];
    outputColors[i3 + 2] = alpha * fb + oneMinusAlpha * sulcalColors[i3 + 2];
  }
}

/**
 * Like applyHeatmap, but linearly interpolates between two timesteps' values
 * before applying the colormap. The lerp is done inline to avoid allocating
 * an intermediate array.
 *
 * @param outputColors  - Float32Array of length nVertices*3, written in-place
 * @param sulcalColors  - Float32Array of length nVertices*3, read-only base colors
 * @param valuesA       - Float32Array of length nVertices, prediction values at timestep A
 * @param valuesB       - Float32Array of length nVertices, prediction values at timestep B
 * @param fraction      - interpolation factor in [0, 1]: 0 = valuesA, 1 = valuesB
 * @param vmin          - threshold below which sulcal background is shown
 * @param alphaScale    - range in remapped space over which alpha ramps 0->1
 */
export function applyHeatmapInterpolated(
  outputColors: Float32Array,
  sulcalColors: Float32Array,
  valuesA: Float32Array,
  valuesB: Float32Array,
  fraction: number,
  vmin: number,
  alphaScale: number,
): void {
  const nVertices = valuesA.length;
  const invRange = vmin < 1 ? 1 / (1 - vmin) : 1;
  const invAlpha = alphaScale > 0 ? 1 / alphaScale : 1;
  const oneMinusFrac = 1 - fraction;

  for (let i = 0; i < nVertices; i++) {
    // Inline lerp between the two timesteps
    const v = oneMinusFrac * valuesA[i] + fraction * valuesB[i];

    if (v < vmin) {
      // Below threshold — keep sulcal colors
      const i3 = i * 3;
      outputColors[i3] = sulcalColors[i3];
      outputColors[i3 + 1] = sulcalColors[i3 + 1];
      outputColors[i3 + 2] = sulcalColors[i3 + 2];
      continue;
    }

    // Remap to [0, 1]
    const mapped = Math.min(1, (v - vmin) * invRange);

    // Compute alpha
    const alpha = mapped < alphaScale ? mapped * invAlpha : 1;

    // Look up fire color — inline for performance
    let fr: number, fg: number, fb: number;

    if (mapped <= 0) {
      fr = 0; fg = 0; fb = 0;
    } else if (mapped >= 1) {
      fr = 1; fg = 1; fb = 0.85;
    } else if (mapped < 0.2) {
      const f = mapped * 5;
      fr = 0.35 * f;
      fg = 0;
      fb = 0;
    } else if (mapped < 0.4) {
      const f = (mapped - 0.2) * 5;
      fr = 0.35 + 0.4 * f;
      fg = 0.15 * f;
      fb = 0;
    } else if (mapped < 0.6) {
      const f = (mapped - 0.4) * 5;
      fr = 0.75 + 0.2 * f;
      fg = 0.15 + 0.3 * f;
      fb = 0.05 * f;
    } else if (mapped < 0.8) {
      const f = (mapped - 0.6) * 5;
      fr = 0.95 + 0.05 * f;
      fg = 0.45 + 0.3 * f;
      fb = 0.05 + 0.15 * f;
    } else {
      const f = (mapped - 0.8) * 5;
      fr = 1.0;
      fg = 0.75 + 0.25 * f;
      fb = 0.2 + 0.65 * f;
    }

    // Alpha blend: output = alpha * fire + (1 - alpha) * sulcal
    const i3 = i * 3;
    const oneMinusAlpha = 1 - alpha;
    outputColors[i3] = alpha * fr + oneMinusAlpha * sulcalColors[i3];
    outputColors[i3 + 1] = alpha * fg + oneMinusAlpha * sulcalColors[i3 + 1];
    outputColors[i3 + 2] = alpha * fb + oneMinusAlpha * sulcalColors[i3 + 2];
  }
}
