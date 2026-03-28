import { useCallback, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { ROIData, PredictionData } from '../types/index.ts';
import { findClosestVertexOnFace } from '../utils/meshUtils.ts';

const LEFT_HEMI_MAX = 10241;

export interface HoverInfo {
  vertexIndex: number;
  roiName: string;
  hemisphere: string;
  activation: number;
  screenX: number;
  screenY: number;
}

interface RaycastHandlerProps {
  roiData: ROIData | null;
  predictions: PredictionData | null;
  timestepIndex: number;
  onHover: (info: HoverInfo | null) => void;
  children: React.ReactNode;
}

/**
 * An R3F component (group wrapper) that lives inside the Canvas.
 * It intercepts pointer events bubbling up from the brain mesh child,
 * resolves the closest vertex, and reports ROI / activation info via onHover.
 */
export function RaycastHandler({
  roiData,
  predictions,
  timestepIndex,
  onHover,
  children,
}: RaycastHandlerProps) {
  // Keep a ref to the latest props so the event handler is stable
  const propsRef = useRef({ roiData, predictions, timestepIndex, onHover });
  propsRef.current = { roiData, predictions, timestepIndex, onHover };

  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    const { roiData: roi, predictions: pred, timestepIndex: ti, onHover: cb } =
      propsRef.current;

    if (!roi || !event.face) {
      cb(null);
      return;
    }

    // Get the geometry's position attribute from the intersected mesh
    const mesh = event.object as THREE.Mesh;
    const geo = mesh.geometry;
    if (!geo) {
      cb(null);
      return;
    }

    const positions = geo.attributes.position?.array as Float32Array | undefined;
    if (!positions) {
      cb(null);
      return;
    }

    const vertexIndex = findClosestVertexOnFace(event.point, event.face, positions);

    const labelIndex = roi.vertexLabels[vertexIndex];
    const roiName = roi.roiNames[labelIndex] ?? 'Unknown';
    const hemisphere = vertexIndex <= LEFT_HEMI_MAX ? 'Left' : 'Right';

    let activation = 0;
    if (pred) {
      const offset = ti * pred.nVertices + vertexIndex;
      activation = pred.data[offset] ?? 0;
    }

    // Pass client coordinates up; the parent will convert to container-relative.
    const screenX = event.nativeEvent.clientX;
    const screenY = event.nativeEvent.clientY;

    cb({
      vertexIndex,
      roiName,
      hemisphere,
      activation,
      screenX,
      screenY,
    });
  }, []);

  const handlePointerLeave = useCallback(() => {
    propsRef.current.onHover(null);
  }, []);

  return (
    <group onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
      {children}
    </group>
  );
}
