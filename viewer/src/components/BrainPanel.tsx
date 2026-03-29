import { useState, useCallback, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BrainMesh } from './BrainMesh';
import { BrainTooltip } from './BrainTooltip';
import { RaycastHandler } from './RaycastHandler';
import type { HoverInfo } from './RaycastHandler';
import { CameraAnimator, requestCameraMove } from './ViewPresets';
import { RegionActivityBar } from './RegionActivityBar';
import { EmotionBar } from './EmotionBar';
import { ReportPanel } from './ReportPanel';
import { useRegionActivity } from '../hooks/useRegionActivity';
import { useEmotionData, useEmotionScores } from '../hooks/useEmotionData';
import { useReportData } from '../hooks/useReportData';
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
  basePath: string;
  onSeek?: (time: number) => void;
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
  demoId: _demoId,
  basePath,
  onSeek,
  initialCameraPosition,
}: BrainPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [activeRegionIndex, setActiveRegionIndex] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);

  const regions = useRegionActivity(predictions, roiData, currentTime, trSeconds);
  const emotionData = useEmotionData(basePath);
  const emotionScores = useEmotionScores(emotionData, currentTime, trSeconds);
  const reportData = useReportData(basePath);

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

  const handleRegionClick = useCallback((index: number) => {
    setActiveRegionIndex(index);
    const region = regions[index];
    if (region) {
      requestCameraMove({
        label: region.name,
        abbr: region.name[0],
        position: region.cameraPosition,
        up: region.cameraUp,
      });
    }
  }, [regions]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: 'transparent',
      }}
    >
      {showReport && reportData && onSeek ? (
        /* ── Report View ── */
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            backgroundColor: '#FFFFFF',
          }}
        >
          <ReportPanel
            report={reportData}
            onSeek={onSeek}
            onBack={() => setShowReport(false)}
          />
        </div>
      ) : (
        /* ── Brain View ── */
        <>
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
                color: '#8B90A0',
                fontSize: '14px',
                fontFamily: 'monospace',
                letterSpacing: '0.05em',
              }}
            >
              Loading brain data...
            </div>
          )}
          <Canvas
            camera={{ position: initialCameraPosition ?? [0, 250, 0], fov: 50, up: [0, 0, 1] }}
            gl={{ preserveDrawingBuffer: true, alpha: true }}
            style={{ width: '100%', flex: 1, minHeight: 0, background: '#FFFFFF' }}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[100, 100, 100]} intensity={0.7} />
            <directionalLight position={[-60, -60, 40]} intensity={0.25} />
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
              maxDistance={700}
            />
            <CameraAnimator />
          </Canvas>
          <RegionActivityBar
            regions={regions}
            activeIndex={activeRegionIndex}
            onRegionClick={handleRegionClick}
          />
          <EmotionBar emotions={emotionScores} />
          {reportData && (
            <div
              style={{
                flexShrink: 0,
                borderTop: '1px solid #E8EAF0',
                padding: '8px 20px',
                display: 'flex',
                justifyContent: 'flex-start',
              }}
            >
              <button
                onClick={() => setShowReport(true)}
                style={{
                  background: '#FFFFFF',
                  color: '#1A1D26',
                  border: '1px solid #D8DBE4',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 16px',
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 500,
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                View Effectiveness Report
              </button>
            </div>
          )}
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
        </>
      )}
    </div>
  );
}
