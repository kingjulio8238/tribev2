import { useRef, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BrainMesh } from './BrainMesh';
import { CameraAnimator } from './ViewPresets';
import { ComparisonSummary } from './ComparisonSummary';
import { TransportBar } from './TransportBar';
import { useBrainData } from '../hooks/useBrainData';
import { useEmotionData } from '../hooks/useEmotionData';
import { useReportData } from '../hooks/useReportData';
import { usePlayback } from '../hooks/usePlayback';
import { LOBE_GROUPS, buildLobeVertexMap } from '../utils/roiGroups';
import type { DemoConfig } from '../utils/demos';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ABComparisonViewProps {
  demoA: DemoConfig;
  demoB: DemoConfig;
  onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

const panelLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: '#8B90A0',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  textAlign: 'center',
  padding: '6px 0',
  ...mono,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ABComparisonView({ demoA, demoB, onBack }: ABComparisonViewProps) {
  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);

  // Load both datasets
  const dataA = useBrainData(demoA.basePath);
  const dataB = useBrainData(demoB.basePath);
  const emotionsA = useEmotionData(demoA.basePath);
  const emotionsB = useEmotionData(demoB.basePath);
  const reportA = useReportData(demoA.basePath);
  const reportB = useReportData(demoB.basePath);

  // Use the shorter duration for synced playback
  const durationA = dataA.metadata ? dataA.metadata.nTimesteps * dataA.metadata.trSeconds : 60;
  const durationB = dataB.metadata ? dataB.metadata.nTimesteps * dataB.metadata.trSeconds : 60;
  const duration = Math.min(durationA, durationB);
  const trSeconds = dataA.metadata?.trSeconds ?? 1.0;

  const playback = usePlayback({ duration, trSeconds, videoRef: videoRefA });

  // Sync video B to A: time, play/pause, and playback speed
  useEffect(() => {
    const vb = videoRefB.current;
    if (!vb) return;
    // Sync play/pause
    if (playback.isPlaying && vb.paused) vb.play();
    if (!playback.isPlaying && !vb.paused) vb.pause();
    // Sync playback speed
    vb.playbackRate = playback.playbackSpeed;
  }, [playback.isPlaying, playback.playbackSpeed]);

  // Sync video B time when it drifts
  useEffect(() => {
    const vb = videoRefB.current;
    if (vb && Math.abs(vb.currentTime - playback.currentTime) > 0.5) {
      vb.currentTime = playback.currentTime;
    }
  }, [playback.currentTime]);

  // Compute mean lobe activations for comparison
  const lobeActivationsA = useMemo(() =>
    computeMeanLobeActivations(dataA.predictions, dataA.roiData),
    [dataA.predictions, dataA.roiData],
  );
  const lobeActivationsB = useMemo(() =>
    computeMeanLobeActivations(dataB.predictions, dataB.roiData),
    [dataB.predictions, dataB.roiData],
  );

  const loading = dataA.loading || dataB.loading;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid #E8EAF0' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: '1px solid #D8DBE4',
            borderRadius: 6,
            padding: '4px 12px',
            fontSize: 11,
            color: '#5A5F70',
            cursor: 'pointer',
            ...mono,
          }}
        >
          ← Back
        </button>
        <span style={{ fontSize: 9, fontWeight: 600, color: '#8B90A0', letterSpacing: '0.12em', textTransform: 'uppercase', ...mono }}>
          A/B Comparison
        </span>
      </div>

      {/* Main content: scrollable */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8B90A0', fontSize: 13, ...mono }}>
            Loading data...
          </div>
        ) : (
          <>
            {/* Side-by-side videos */}
            <div style={{ display: 'flex', gap: 2, padding: '8px 8px 0' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={panelLabel}>A: {demoA.name}</div>
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E8EAF0', backgroundColor: '#000' }}>
                  <video
                    ref={videoRefA}
                    src={`${demoA.basePath}/stimulus/media.mp4`}
                    style={{ width: '100%', display: 'block' }}
                    playsInline
                  />
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={panelLabel}>B: {demoB.name}</div>
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E8EAF0', backgroundColor: '#000' }}>
                  <video
                    ref={videoRefB}
                    src={`${demoB.basePath}/stimulus/media.mp4`}
                    style={{ width: '100%', display: 'block' }}
                    playsInline
                  />
                </div>
              </div>
            </div>

            {/* Side-by-side brains */}
            <div style={{ display: 'flex', gap: 2, padding: '4px 8px' }}>
              <div style={{ flex: 1, height: 220, borderRadius: 8, overflow: 'hidden', border: '1px solid #E8EAF0', backgroundColor: '#FFFFFF' }}>
                {dataA.meshData && dataA.predictions && dataA.metadata && (
                  <Canvas
                    camera={{ position: [0, 250, 0], fov: 50, up: [0, 0, 1] }}
                    gl={{ alpha: true }}
                    style={{ width: '100%', height: '100%', background: '#FFFFFF' }}
                  >
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[100, 100, 100]} intensity={0.7} />
                    <directionalLight position={[-60, -60, 40]} intensity={0.25} />
                    <BrainMesh
                      timestepIndex={playback.timestepIndex}
                      currentTime={playback.currentTime}
                      trSeconds={trSeconds}
                      meshData={dataA.meshData}
                      predictions={dataA.predictions}
                      metadata={dataA.metadata}
                    />
                    <OrbitControls enablePan={false} enableZoom={false} enableRotate={true} minDistance={150} maxDistance={400} />
                    <CameraAnimator />
                  </Canvas>
                )}
              </div>
              <div style={{ flex: 1, height: 220, borderRadius: 8, overflow: 'hidden', border: '1px solid #E8EAF0', backgroundColor: '#FFFFFF' }}>
                {dataB.meshData && dataB.predictions && dataB.metadata && (
                  <Canvas
                    camera={{ position: [0, 250, 0], fov: 50, up: [0, 0, 1] }}
                    gl={{ alpha: true }}
                    style={{ width: '100%', height: '100%', background: '#FFFFFF' }}
                  >
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[100, 100, 100]} intensity={0.7} />
                    <directionalLight position={[-60, -60, 40]} intensity={0.25} />
                    <BrainMesh
                      timestepIndex={playback.timestepIndex}
                      currentTime={playback.currentTime}
                      trSeconds={trSeconds}
                      meshData={dataB.meshData}
                      predictions={dataB.predictions}
                      metadata={dataB.metadata}
                    />
                    <OrbitControls enablePan={false} enableZoom={false} enableRotate={true} minDistance={150} maxDistance={400} />
                    <CameraAnimator />
                  </Canvas>
                )}
              </div>
            </div>

            {/* Comparison Summary */}
            <ComparisonSummary
              reportA={reportA}
              reportB={reportB}
              emotionsA={emotionsA}
              emotionsB={emotionsB}
              lobeActivationsA={lobeActivationsA}
              lobeActivationsB={lobeActivationsB}
            />
          </>
        )}
      </div>

      {/* Shared transport bar */}
      <div style={{ flexShrink: 0, padding: '0 8px 8px' }}>
        <TransportBar
          currentTime={playback.currentTime}
          duration={playback.duration}
          isPlaying={playback.isPlaying}
          timestepIndex={playback.timestepIndex}
          nTimesteps={playback.nTimesteps}
          trSeconds={trSeconds}
          playbackSpeed={playback.playbackSpeed}
          onToggle={playback.toggle}
          onSeek={playback.seek}
          onStepForward={playback.stepForward}
          onStepBackward={playback.stepBackward}
          onSetPlaybackSpeed={playback.setPlaybackSpeed}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function computeMeanLobeActivations(
  predictions: { data: Float32Array; nTimesteps: number; nVertices: number } | null,
  roiData: { vertexLabels: Uint16Array; roiNames: string[] } | null,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!predictions || !roiData) return result;

  const lobeVertexMap = buildLobeVertexMap(roiData.roiNames, roiData.vertexLabels);
  const { data, nTimesteps, nVertices } = predictions;

  for (const group of LOBE_GROUPS) {
    const indices = lobeVertexMap.get(group.name);
    if (!indices || indices.length === 0) {
      result[group.name] = 0;
      continue;
    }

    let total = 0;
    for (let t = 0; t < nTimesteps; t++) {
      const offset = t * nVertices;
      let sum = 0;
      for (let i = 0; i < indices.length; i++) {
        sum += data[offset + indices[i]];
      }
      total += sum / indices.length;
    }
    result[group.name] = total / nTimesteps;
  }

  return result;
}
