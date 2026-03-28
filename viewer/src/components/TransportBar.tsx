import { useRef, useCallback, useEffect, useState } from 'react';

interface TransportBarProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  timestepIndex: number;
  nTimesteps: number;
  trSeconds: number;
  playbackSpeed: number;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onSetPlaybackSpeed: (speed: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.5, 1, 2] as const;

export function TransportBar({
  currentTime,
  duration,
  isPlaying,
  timestepIndex,
  nTimesteps,
  trSeconds,
  playbackSpeed,
  onToggle,
  onSeek,
  onStepForward,
  onStepBackward,
  onSetPlaybackSpeed,
}: TransportBarProps) {
  const progress = duration > 0 ? currentTime / duration : 0;
  const scrubRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);

  /** Compute fraction from a mouse/pointer event relative to the scrub bar */
  const fractionFromEvent = useCallback(
    (clientX: number): number => {
      const el = scrubRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      isDraggingRef.current = true;
      setIsDragging(true);
      const frac = fractionFromEvent(e.clientX);
      onSeek(frac * duration);
    },
    [fractionFromEvent, onSeek, duration],
  );

  // Global mousemove / mouseup while dragging
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const frac = fractionFromEvent(e.clientX);
      onSeek(frac * duration);
    };
    const handleUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [fractionFromEvent, onSeek, duration]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const frac = fractionFromEvent(e.clientX);
      setHoverProgress(frac);
    },
    [fractionFromEvent],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverProgress(null);
  }, []);

  // Build tick marks for TR boundaries
  const ticks: number[] = [];
  if (trSeconds > 0 && duration > 0 && nTimesteps <= 500) {
    for (let i = 1; i < nTimesteps; i++) {
      ticks.push((i * trSeconds) / duration);
    }
  }

  return (
    <div
      style={{
        height: 52,
        backgroundColor: '#FFFFFF',
        border: '1px solid #E8EAF0',
        borderRadius: 12,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 14,
        flexShrink: 0,
        transition: 'border-color 150ms',
      }}
    >
      {/* Step backward */}
      <button
        className="tribe-transport-btn"
        onClick={onStepBackward}
        style={buttonStyle}
        title="Step backward (Left arrow)"
        tabIndex={0}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="3" width="2" height="10" />
          <polygon points="14,3 6,8 14,13" />
        </svg>
      </button>

      {/* Play/Pause */}
      <button
        className="tribe-transport-btn"
        onClick={onToggle}
        style={buttonStyle}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        tabIndex={0}
      >
        {isPlaying ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="2" width="4" height="12" />
            <rect x="9" y="2" width="4" height="12" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <polygon points="3,2 14,8 3,14" />
          </svg>
        )}
      </button>

      {/* Step forward */}
      <button
        className="tribe-transport-btn"
        onClick={onStepForward}
        style={buttonStyle}
        title="Step forward (Right arrow)"
        tabIndex={0}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <polygon points="2,3 10,8 2,13" />
          <rect x="12" y="3" width="2" height="10" />
        </svg>
      </button>

      {/* Speed selector */}
      <div style={{ display: 'flex', gap: 2 }}>
        {SPEED_OPTIONS.map((speed) => (
          <button
            className="tribe-transport-btn"
            key={speed}
            onClick={() => onSetPlaybackSpeed(speed)}
            style={{
              ...speedButtonStyle,
              color: playbackSpeed === speed ? '#2B7A83' : '#8B90A0',
              borderColor: playbackSpeed === speed ? '#2B7A83' : '#D8DBE4',
              backgroundColor: playbackSpeed === speed ? 'rgba(43, 122, 131, 0.08)' : 'transparent',
            }}
            title={`Playback speed ${speed}x`}
            tabIndex={0}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Time display */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          fontWeight: 500,
          color: '#4A4E5A',
          minWidth: 110,
          textAlign: 'center',
        }}
      >
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>

      {/* Timestep indicator */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: '#8B90A0',
          minWidth: 80,
          textAlign: 'center',
          borderLeft: '1px solid #E8EAF0',
          paddingLeft: 12,
        }}
      >
        TR {timestepIndex + 1} / {nTimesteps}
      </div>

      {/* Scrub bar */}
      <div
        ref={scrubRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          flex: 1,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          position: 'relative',
          userSelect: 'none',
        }}
      >
        {/* Track background */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: '100%',
            height: 6,
            backgroundColor: '#E4E6EC',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          {/* Filled portion */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${progress * 100}%`,
              backgroundColor: '#2B7A83',
              borderRadius: 3,
              transition: 'none',
            }}
          />
        </div>

        {/* TR tick marks */}
        {ticks.map((frac, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${frac * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 1,
              height: 10,
              backgroundColor: 'rgba(43, 122, 131, 0.12)',
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Hover indicator */}
        {hoverProgress !== null && !isDragging && (
          <div
            style={{
              position: 'absolute',
              left: `${hoverProgress * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 1,
              height: 14,
              backgroundColor: 'rgba(0, 0, 0, 0.08)',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Playhead dot — positioned at the end of the filled bar */}
        <div
          style={{
            position: 'absolute',
            left: `calc(${progress * 100}% - ${isDragging ? 7 : 5}px)`,
            top: '50%',
            transform: 'translateY(-50%)',
            width: isDragging ? 14 : 10,
            height: isDragging ? 14 : 10,
            borderRadius: '50%',
            backgroundColor: '#FFFFFF',
            border: '2px solid #2B7A83',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            transition: isDragging ? 'none' : 'width 0.1s, height 0.1s, left 0.05s linear',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  background: '#F4F5F7',
  border: '1px solid #D8DBE4',
  borderRadius: 6,
  color: '#5A5F70',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  cursor: 'pointer',
  padding: '6px 8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
};

const speedButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #D8DBE4',
  borderRadius: 3,
  cursor: 'pointer',
  padding: '3px 6px',
  fontSize: 10,
  fontFamily: 'monospace',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
  lineHeight: 1,
};
