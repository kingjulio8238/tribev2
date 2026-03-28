import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BrainMeshData, PredictionData, Metadata } from '../types/index.ts';
import { applyHeatmapInterpolated } from '../utils/colormap.ts';

interface BrainMeshProps {
  timestepIndex: number;
  currentTime: number;
  trSeconds: number;
  meshData: BrainMeshData | null;
  predictions: PredictionData | null;
  metadata: Metadata | null;
}

export function BrainMesh({
  timestepIndex: _timestepIndex,
  currentTime,
  trSeconds,
  meshData,
  predictions,
  metadata,
}: BrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Track last applied state to avoid redundant updates (e.g. when paused)
  const lastAppliedRef = useRef<{ t: number; fraction: number }>({ t: -1, fraction: -1 });

  // Compute the base sulcal depth greyscale colors once from meshData.
  // This never changes, so we cache it in a useMemo keyed on meshData.
  const sulcalColors = useMemo(() => {
    if (!meshData) return null;

    const nVertices = meshData.vertices.length / 3;
    const colors = new Float32Array(nVertices * 3);

    const darkGrey = [0.25, 0.25, 0.27] as const;
    const lightGrey = [0.55, 0.55, 0.58] as const;

    for (let i = 0; i < nVertices; i++) {
      const sulcal = meshData.sulcalDepth[i];
      const t = Math.min(1, Math.max(0, sulcal * 2 + 0.5));
      colors[i * 3] = lightGrey[0] + (darkGrey[0] - lightGrey[0]) * t;
      colors[i * 3 + 1] = lightGrey[1] + (darkGrey[1] - lightGrey[1]) * t;
      colors[i * 3 + 2] = lightGrey[2] + (darkGrey[2] - lightGrey[2]) * t;
    }

    return colors;
  }, [meshData]);

  // Build the geometry once from meshData + sulcal colors.
  const geometry = useMemo(() => {
    if (!meshData || !sulcalColors) return null;

    const geo = new THREE.BufferGeometry();

    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(meshData.vertices, 3)
    );

    geo.setIndex(new THREE.BufferAttribute(meshData.faces, 1));

    // Create a mutable copy for the displayed vertex colors.
    // This buffer will be updated in-place when the heatmap changes.
    const displayColors = new Float32Array(sulcalColors.length);
    displayColors.set(sulcalColors);

    geo.setAttribute('color', new THREE.Float32BufferAttribute(displayColors, 3));

    geo.computeVertexNormals();

    return geo;
  }, [meshData, sulcalColors]);

  // Per-frame update: interpolate between timesteps for smooth 60fps transitions
  useFrame(() => {
    if (!geometry || !sulcalColors) return;

    const colorAttr = geometry.attributes.color as THREE.Float32BufferAttribute;
    const outputColors = colorAttr.array as Float32Array;

    if (predictions && metadata) {
      const nVertices = predictions.nVertices;
      const nTimesteps = predictions.nTimesteps;
      const vmin = metadata.vmin ?? 0.5;
      const alphaScale = metadata.alphaScale ?? 0.2;

      // Compute continuous timestep position
      const continuous = currentTime / trSeconds;
      const t = Math.max(0, Math.min(nTimesteps - 1, Math.floor(continuous)));
      const fraction = Math.min(1, Math.max(0, continuous - t));

      // Skip redundant updates when nothing changed (e.g. paused)
      if (t === lastAppliedRef.current.t && fraction === lastAppliedRef.current.fraction) {
        return;
      }
      lastAppliedRef.current.t = t;
      lastAppliedRef.current.fraction = fraction;

      // Get valuesA for timestep t
      const offsetA = t * nVertices;
      const valuesA = predictions.data.subarray(offsetA, offsetA + nVertices);

      // Get valuesB for timestep t+1, clamped to last timestep
      const tNext = Math.min(t + 1, nTimesteps - 1);
      const offsetB = tNext * nVertices;
      const valuesB = predictions.data.subarray(offsetB, offsetB + nVertices);

      applyHeatmapInterpolated(outputColors, sulcalColors, valuesA, valuesB, fraction, vmin, alphaScale);
    } else {
      // No predictions — show only sulcal background
      // Only update if we haven't already reset
      if (lastAppliedRef.current.t !== -1 || lastAppliedRef.current.fraction !== -1) {
        outputColors.set(sulcalColors);
        lastAppliedRef.current.t = -1;
        lastAppliedRef.current.fraction = -1;
      } else {
        return;
      }
    }

    colorAttr.needsUpdate = true;
  });

  if (!meshData || !geometry) return null;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        vertexColors={true}
        roughness={0.7}
        metalness={0.05}
      />
    </mesh>
  );
}
