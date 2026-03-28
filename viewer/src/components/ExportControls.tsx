import { useState, useCallback, useRef, useEffect } from 'react';

interface ExportControlsProps {
  timestepIndex: number;
  currentTime: number;
  demoId: string;
  canvasContainerRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Floating panel with screenshot and share-URL buttons.
 * Positioned in the bottom-right of the brain panel (above the transport bar).
 */
export function ExportControls({
  timestepIndex,
  currentTime,
  demoId,
  canvasContainerRef,
}: ExportControlsProps) {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  /** Capture the Three.js canvas and trigger a PNG download. */
  const handleScreenshot = useCallback(() => {
    const canvas = (canvasContainerRef?.current?.querySelector('canvas') ??
      document.querySelector('canvas')) as HTMLCanvasElement | null;
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `tribe-brain-TR${timestepIndex}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // toDataURL may fail if canvas is tainted, silently ignore
    }
  }, [timestepIndex, canvasContainerRef]);

  /** Build a shareable URL and copy it to the clipboard. */
  const handleShare = useCallback(() => {
    // Read current camera position from the canvas's Three.js renderer
    // We encode it into the URL for reproducibility
    let viewParam = '';
    try {
      // Access the R3F store through the canvas's __r3f property
      const canvas = (canvasContainerRef?.current?.querySelector('canvas') ??
        document.querySelector('canvas')) as HTMLCanvasElement & {
        __r3f?: { store?: { getState: () => { camera: { position: { x: number; y: number; z: number } } } } };
      };
      const store = canvas?.__r3f?.store;
      if (store) {
        const state = store.getState();
        const pos = state.camera.position;
        viewParam = `${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}`;
      }
    } catch {
      // If we can't read camera, just omit the view param
    }

    const params = new URLSearchParams();
    params.set('demo', demoId);
    params.set('t', currentTime.toFixed(2));
    if (viewParam) {
      params.set('view', viewParam);
    }

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    navigator.clipboard.writeText(url).then(
      () => {
        setShowCopied(true);
        if (copiedTimerRef.current !== null) {
          clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = setTimeout(() => {
          setShowCopied(false);
          copiedTimerRef.current = null;
        }, 1500);
      },
      () => {
        // Clipboard write failed — fallback: select text in a temp input
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        setShowCopied(true);
        if (copiedTimerRef.current !== null) {
          clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = setTimeout(() => {
          setShowCopied(false);
          copiedTimerRef.current = null;
        }, 1500);
      },
    );
  }, [demoId, currentTime, canvasContainerRef]);

  return (
    <div style={containerStyle}>
      {/* Screenshot button */}
      <button
        title="Save screenshot"
        style={{
          ...baseButtonStyle,
          ...(hoveredButton === 'screenshot' ? hoverButtonStyle : {}),
        }}
        onMouseEnter={() => setHoveredButton('screenshot')}
        onMouseLeave={() => setHoveredButton(null)}
        onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.92)'}
        onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
        onClick={handleScreenshot}
      >
        {/* Camera icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>

      {/* Share button with "Copied!" toast */}
      <div style={{ position: 'relative' }}>
        <button
          title="Copy shareable URL"
          style={{
            ...baseButtonStyle,
            ...(hoveredButton === 'share' ? hoverButtonStyle : {}),
          }}
          onMouseEnter={() => setHoveredButton('share')}
          onMouseLeave={() => setHoveredButton(null)}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.92)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onClick={handleShare}
        >
          {/* Link icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>

        {/* "Copied!" toast */}
        {showCopied && (
          <div style={copiedToastStyle}>
            Copied!
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const BUTTON_SIZE = 28;

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  right: 12,
  display: 'flex',
  flexDirection: 'row',
  gap: 4,
  padding: 4,
  borderRadius: 6,
  backgroundColor: 'rgba(15, 15, 25, 0.75)',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255,255,255,0.06)',
  zIndex: 10,
  pointerEvents: 'auto',
};

const baseButtonStyle: React.CSSProperties = {
  width: BUTTON_SIZE,
  height: BUTTON_SIZE,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.10)',
  backgroundColor: 'rgba(255,255,255,0.05)',
  color: '#aaa',
  cursor: 'pointer',
  transition: 'background-color 150ms, color 150ms, border-color 150ms, transform 100ms',
  padding: 0,
  lineHeight: 1,
};

const hoverButtonStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.14)',
  color: '#ddd',
  borderColor: 'rgba(255,255,255,0.22)',
};

const copiedToastStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  left: '50%',
  transform: 'translateX(-50%)',
  marginBottom: 6,
  padding: '3px 8px',
  borderRadius: 4,
  backgroundColor: 'rgba(74, 138, 154, 0.9)',
  color: '#fff',
  fontSize: 10,
  fontFamily: 'monospace',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  animation: 'tribe-copied-fade 1.5s ease-in-out forwards',
};
