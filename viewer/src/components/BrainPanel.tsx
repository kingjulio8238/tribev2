import { useState, useCallback, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BrainMesh } from './BrainMesh';
import { ColorBar } from './ColorBar';
import { BrainTooltip } from './BrainTooltip';
import { RaycastHandler } from './RaycastHandler';
import type { HoverInfo } from './RaycastHandler';
import { CameraAnimator, ViewPresetButtons } from './ViewPresets';
import { ExportControls } from './ExportControls';
import type {
  BrainMeshData,
  PredictionData,
  Metadata,
  ROIData,
} from '../types/index.ts';

interface BrainPanelProps {
  timestepIndex: number;
  currentTime: number;
  trSeconds: number;
  meshData: BrainMeshData | null;
  predictions: PredictionData | null;
  metadata: Metadata | null;
  roiData: ROIData | null;
  loading: boolean;
  demoId: string;
  initialCameraPosition?: [number, number, number];
}

export function BrainPanel({
  timestepIndex,
  currentTime,
  trSeconds,
  meshData,
  predictions,
  metadata,
  roiData,
  loading,
  demoId,
  initialCameraPosition,
}: BrainPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Convert client coordinates to container-relative for tooltip positioning
  const handleHover = useCallback((info: HoverInfo | null) => {
    if (!info) {
      setHoverInfo(null);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setHoverInfo({
        ...info,
        screenX: info.screenX - rect.left,
        screenY: info.screenY - rect.top,
      });
    } else {
      setHoverInfo(info);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: '#0a0a0f',
      }}
    >
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            color: '#8888aa',
            fontSize: '14px',
            fontFamily: 'monospace',
            letterSpacing: '0.05em',
          }}
        >
          Loading brain data...
        </div>
      )}
      <Canvas
        camera={{ position: initialCameraPosition ?? [0, 0, 200], fov: 50 }}
        gl={{ preserveDrawingBuffer: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[100, 100, 100]} intensity={0.8} />
        <directionalLight position={[-60, -60, 40]} intensity={0.3} />
        <RaycastHandler
          roiData={roiData}
          predictions={predictions}
          timestepIndex={timestepIndex}
          onHover={handleHover}
        >
          <BrainMesh
            timestepIndex={timestepIndex}
            currentTime={currentTime}
            trSeconds={trSeconds}
            meshData={meshData}
            predictions={predictions}
            metadata={metadata}
          />
        </RaycastHandler>
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={100}
          maxDistance={500}
        />
        <CameraAnimator />
      </Canvas>
      <ViewPresetButtons />
      <ColorBar vmin={metadata?.vmin} />
      <ExportControls
        timestepIndex={timestepIndex}
        currentTime={currentTime}
        demoId={demoId}
        canvasContainerRef={containerRef}
      />
      <BrainTooltip
        visible={hoverInfo !== null}
        x={hoverInfo?.screenX ?? 0}
        y={hoverInfo?.screenY ?? 0}
        roiName={hoverInfo?.roiName ?? ''}
        hemisphere={hoverInfo?.hemisphere ?? ''}
        activation={hoverInfo?.activation ?? 0}
        containerWidth={containerSize.width}
        containerHeight={containerSize.height}
      />
    </div>
  );
}
