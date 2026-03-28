import { useRef, useEffect, useState, useCallback } from 'react';
import { MediaPanel } from './components/MediaPanel';
import { BrainPanel } from './components/BrainPanel';
import { TransportBar } from './components/TransportBar';
import { DemoSelector } from './components/DemoSelector';
import { usePlayback } from './hooks/usePlayback';
import { useBrainData } from './hooks/useBrainData';
import { DEMOS, DEFAULT_DEMO } from './utils/demos';
import type { DemoConfig } from './utils/demos';

/** Returns true when the viewport is narrower than the given breakpoint. */
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

/** Parse URL search params for deep-link / sharing support. */
function parseShareParams(): {
  demo: DemoConfig;
  initialTime: number | null;
  initialCameraPosition: [number, number, number] | null;
} {
  const params = new URLSearchParams(window.location.search);
  let demo = DEFAULT_DEMO;
  let initialTime: number | null = null;
  let initialCameraPosition: [number, number, number] | null = null;

  const demoParam = params.get('demo');
  if (demoParam) {
    const found = DEMOS.find((d) => d.id === demoParam);
    if (found) demo = found;
  }

  const tParam = params.get('t');
  if (tParam !== null) {
    const parsed = parseFloat(tParam);
    if (Number.isFinite(parsed) && parsed >= 0) {
      initialTime = parsed;
    }
  }

  const viewParam = params.get('view');
  if (viewParam) {
    const parts = viewParam.split(',').map(Number);
    if (
      parts.length === 3 &&
      parts.every((n) => Number.isFinite(n))
    ) {
      initialCameraPosition = parts as [number, number, number];
    }
  }

  return { demo, initialTime, initialCameraPosition };
}

export function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Parse URL share params once on mount
  const shareParams = useRef(parseShareParams());

  const [currentDemo, setCurrentDemo] = useState<DemoConfig>(
    shareParams.current.demo,
  );
  const { meshData, predictions, metadata, segments, roiData, loading, error } =
    useBrainData(currentDemo.basePath);

  const isNarrow = useIsNarrow(900);

  // Derive duration and trSeconds from loaded metadata, with fallbacks
  const duration = metadata
    ? metadata.nTimesteps * metadata.trSeconds
    : 60;
  const trSeconds = metadata ? metadata.trSeconds : 1.0;

  const playback = usePlayback({
    duration,
    trSeconds,
    videoRef,
  });

  // Seek to the shared time once metadata has loaded
  const didSeekFromUrl = useRef(false);
  useEffect(() => {
    if (
      !didSeekFromUrl.current &&
      metadata &&
      shareParams.current.initialTime !== null
    ) {
      playback.seek(shareParams.current.initialTime);
      didSeekFromUrl.current = true;

      // Clean URL params so a page refresh starts fresh
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [metadata, playback.seek]);

  // Handle demo change: reset playback to time 0
  const handleDemoChange = useCallback(
    (demo: DemoConfig) => {
      setCurrentDemo(demo);
      playback.seek(0);
    },
    [playback.seek],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input element
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
  }, [playback.toggle, playback.stepForward, playback.stepBackward]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#F4F5F7',
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
            backgroundColor: 'rgba(244, 245, 247, 0.75)',
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
            backgroundColor: 'rgba(244, 245, 247, 0.90)',
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

      {/* Inner flex layout: header, panels, transport as card elements */}
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Header bar */}
        <div
          style={{
            height: 44,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8EAF0',
            borderRadius: 12,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Brain icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2B7A83"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2C9 2 6.5 4 6.5 7c0 1.5.5 2.8 1.3 3.8C6.5 12 5.5 13.5 5.5 15.5 5.5 18 7 20 9.5 20.5c.3.5 1 1.5 2.5 1.5s2.2-1 2.5-1.5C17 20 18.5 18 18.5 15.5c0-2-1-3.5-2.3-4.7.8-1 1.3-2.3 1.3-3.8C17.5 4 15 2 12 2z" />
              <path d="M12 2v20" />
              <path d="M8 8c1.5 0 2.5 1 4 1s2.5-1 4-1" />
              <path d="M7.5 14c1.5.5 3 1 4.5 1s3-.5 4.5-1" />
            </svg>
            <span
              style={{
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                fontSize: 12,
                fontWeight: 600,
                color: '#4A4E5A',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                userSelect: 'none',
              }}
            >
              TRIBE v2 Brain Viewer
            </span>
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: '#8B90A0',
              letterSpacing: '0.05em',
            }}
          >
            TR {playback.timestepIndex + 1}
            <span style={{ color: '#C0C4D0', margin: '0 4px' }}>/</span>
            {playback.nTimesteps}
          </div>
        </div>

        {/* Main panels */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: isNarrow ? 'column' : 'row',
            gap: 10,
            overflow: 'hidden',
          }}
        >
          {/* Left / Top panel - Media */}
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
              basePath={currentDemo.basePath}
            />
          </div>

          {/* Right / Bottom panel - Brain */}
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
            <DemoSelector
              demos={DEMOS}
              current={currentDemo}
              onChange={handleDemoChange}
            />
            <BrainPanel
              timestepIndex={playback.timestepIndex}
              currentTime={playback.currentTime}
              trSeconds={trSeconds}
              meshData={meshData}
              predictions={predictions}
              metadata={metadata}
              roiData={roiData}
              loading={loading}
              demoId={currentDemo.id}
              initialCameraPosition={
                shareParams.current.initialCameraPosition ?? undefined
              }
            />
          </div>
        </div>

        {/* Bottom transport bar */}
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
