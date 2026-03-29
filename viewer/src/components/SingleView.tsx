import { useRef, useEffect, useState, useCallback } from 'react';
import { MediaPanel } from './MediaPanel';
import { BrainPanel } from './BrainPanel';
import { TransportBar } from './TransportBar';
import { ReportPanel } from './ReportPanel';
import { usePlayback } from '../hooks/usePlayback';
import { useBrainData } from '../hooks/useBrainData';
import { useReportData } from '../hooks/useReportData';
import { useEmotionData } from '../hooks/useEmotionData';
import type { DemoConfig } from '../utils/demos';

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useIsNarrow(breakpoint = 900): boolean {
  const [isNarrow, setIsNarrow] = useState(
    () => window.innerWidth < breakpoint,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mql.addEventListener('change', handler);
    setIsNarrow(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);

  return isNarrow;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface SingleViewProps {
  demo: DemoConfig;
  initialTime: number | null;
  initialCameraPosition?: [number, number, number];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SingleView({ demo, initialTime, initialCameraPosition }: SingleViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const { meshData, predictions, metadata, segments, roiData, loading, error } =
    useBrainData(demo.basePath);

  const reportData = useReportData(demo.basePath);
  const emotionData = useEmotionData(demo.basePath);
  const [showReport, setShowReport] = useState(false);
  const [copied, setCopied] = useState(false);

  const isNarrow = useIsNarrow(900);

  const duration = metadata
    ? metadata.nTimesteps * metadata.trSeconds
    : 60;
  const trSeconds = metadata ? metadata.trSeconds : 1.0;

  const playback = usePlayback({
    duration,
    trSeconds,
    videoRef,
  });

  const handleShare = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('demo', demo.id);
    url.searchParams.set('t', String(Math.floor(playback.currentTime)));
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [demo.id, playback.currentTime]);

  // Seek to the shared time once metadata has loaded
  const didSeekFromUrl = useRef(false);
  useEffect(() => {
    if (
      !didSeekFromUrl.current &&
      metadata &&
      initialTime !== null
    ) {
      playback.seek(initialTime);
      didSeekFromUrl.current = true;
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [metadata, playback.seek, initialTime]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Escape' && showReport) {
        setShowReport(false);
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          playback.toggle();
          break;
        case 'ArrowRight':
          e.preventDefault();
          playback.stepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          playback.stepBackward();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playback.toggle, playback.stepForward, playback.stepBackward, showReport]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        position: 'relative',
        padding: 12,
      }}
    >
      {/* Loading overlay */}
      {loading && (
        <div
          className="tribe-loading-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.75)',
            zIndex: 100,
            pointerEvents: 'none',
          }}
        >
          <div
            className="tribe-loading-pill"
            style={{
              color: '#8B90A0',
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.05em',
              padding: '12px 24px',
              backgroundColor: '#FFFFFF',
              borderRadius: 10,
              border: '1px solid #E8EAF0',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            }}
          >
            Loading data...
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && !loading && (
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
            backgroundColor: 'rgba(255, 255, 255, 0.90)',
            zIndex: 101,
          }}
        >
          <div
            style={{
              color: '#C53030',
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.03em',
              padding: '16px 28px',
              backgroundColor: '#FFFFFF',
              borderRadius: 10,
              border: '1px solid #F0C4C4',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              maxWidth: 420,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        </div>
      )}

      {showReport && reportData ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8EAF0',
            borderRadius: 12,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            overflow: 'auto',
          }}
        >
          <ReportPanel
            report={reportData}
            basePath={demo.basePath}
            meshData={meshData}
            predictions={predictions}
            metadata={metadata}
            roiData={roiData}
            emotionData={emotionData}
            onSeek={(time) => {
              setShowReport(false);
              setTimeout(() => playback.seek(time), 100);
            }}
            onBack={() => setShowReport(false)}
          />
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: isNarrow ? 'column' : 'row',
              gap: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                flex: isNarrow ? undefined : 4,
                width: isNarrow ? '100%' : undefined,
                height: isNarrow ? '50%' : '100%',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E8EAF0',
                borderRadius: 12,
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                overflow: 'hidden',
              }}
            >
              <MediaPanel
                currentTime={playback.currentTime}
                duration={playback.duration}
                isPlaying={playback.isPlaying}
                segments={segments}
                videoRef={videoRef}
                onTimeUpdate={playback.seek}
                basePath={demo.basePath}
              />
            </div>

            <div
              style={{
                flex: isNarrow ? undefined : 6,
                width: isNarrow ? '100%' : undefined,
                height: isNarrow ? '50%' : '100%',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E8EAF0',
                borderRadius: 12,
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <BrainPanel
                timestepIndex={playback.timestepIndex}
                currentTime={playback.currentTime}
                trSeconds={trSeconds}
                meshData={meshData}
                predictions={predictions}
                metadata={metadata}
                roiData={roiData}
                loading={loading}
                demoId={demo.id}
                basePath={demo.basePath}
                onSeek={playback.seek}
                hasReport={reportData !== null}
                onShowReport={() => setShowReport(true)}
                onShare={handleShare}
                shareCopied={copied}
                initialCameraPosition={initialCameraPosition}
              />
            </div>
          </div>

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
      )}
    </div>
  );
}
