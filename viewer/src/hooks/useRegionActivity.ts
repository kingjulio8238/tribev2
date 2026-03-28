import { useMemo } from 'react';
import type { PredictionData, ROIData } from '../types/index.ts';
import { LOBE_GROUPS, buildLobeVertexMap } from '../utils/roiGroups.ts';

export interface RegionActivity {
  name: string;
  activation: number; // mean activation [0, 1] for this lobe at current timestep
  cameraPosition: [number, number, number];
  cameraUp: [number, number, number];
}

const EMPTY_RESULT: RegionActivity[] = LOBE_GROUPS.map((g) => ({
  name: g.name,
  activation: 0,
  cameraPosition: g.cameraPosition,
  cameraUp: g.cameraUp,
}));

export function useRegionActivity(
  predictions: PredictionData | null,
  roiData: ROIData | null,
  currentTime: number,
  trSeconds: number,
): RegionActivity[] {
  // Build the lobe-to-vertex-indices map once when roiData changes.
  const lobeVertexMap = useMemo(() => {
    if (!roiData) return null;
    return buildLobeVertexMap(roiData.roiNames, roiData.vertexLabels);
  }, [roiData]);

  // Derive the integer timestep so we only recompute when it actually changes
  // (not on every sub-TR currentTime update at 60fps).
  const timestepIndex = useMemo(() => {
    if (!predictions) return 0;
    const rawIndex = trSeconds > 0 ? Math.floor(currentTime / trSeconds) : 0;
    return Math.min(Math.max(rawIndex, 0), predictions.nTimesteps - 1);
  }, [currentTime, trSeconds, predictions]);

  // Compute per-lobe mean activation for the current timestep.
  return useMemo(() => {
    if (!predictions || !lobeVertexMap) return EMPTY_RESULT;

    const { data, nVertices } = predictions;

    const frameOffset = timestepIndex * nVertices;
    const frameData = data.subarray(frameOffset, frameOffset + nVertices);

    return LOBE_GROUPS.map((group) => {
      const indices = lobeVertexMap.get(group.name);
      let activation = 0;

      if (indices && indices.length > 0) {
        let sum = 0;
        for (let i = 0; i < indices.length; i++) {
          sum += frameData[indices[i]];
        }
        activation = sum / indices.length;
      }

      return {
        name: group.name,
        activation,
        cameraPosition: group.cameraPosition,
        cameraUp: group.cameraUp,
      };
    });
  }, [predictions, lobeVertexMap, timestepIndex]);
}
