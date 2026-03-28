import { useState, useCallback, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

/* ------------------------------------------------------------------ */
/*  View preset definitions (from tribev2 VIEW_DICT)                  */
/* ------------------------------------------------------------------ */

interface ViewPreset {
  label: string;
  abbr: string;
  position: [number, number, number];
  up: [number, number, number];
}

const VIEW_PRESETS: ViewPreset[] = [
  { label: 'Left Lateral', abbr: 'L', position: [-200, 0, 0], up: [0, 0, 1] },
  { label: 'Right Lateral', abbr: 'R', position: [200, 0, 0], up: [0, 0, 1] },
  { label: 'Dorsal', abbr: 'D', position: [0, 0, 200], up: [0, 1, 0] },
  { label: 'Ventral', abbr: 'V', position: [0, 0, -200], up: [0, -1, 0] },
  { label: 'Anterior', abbr: 'A', position: [0, 200, 0], up: [0, 0, 1] },
  { label: 'Posterior', abbr: 'P', position: [0, -200, 0], up: [0, 0, 1] },
];

/* ------------------------------------------------------------------ */
/*  Shared state between HTML overlay and R3F scene                   */
/* ------------------------------------------------------------------ */

interface CameraTarget {
  position: Vector3;
  up: Vector3;
}

// Simple module-level store so the HTML buttons can signal
// the R3F component without requiring a context provider.
let pendingTarget: CameraTarget | null = null;

function requestCameraMove(preset: ViewPreset) {
  pendingTarget = {
    position: new Vector3(...preset.position),
    up: new Vector3(...preset.up),
  };
}

/* ------------------------------------------------------------------ */
/*  R3F component: must live INSIDE <Canvas>                          */
/*  Smoothly lerps the camera toward the pending target each frame.   */
/* ------------------------------------------------------------------ */

const LERP_FACTOR = 0.07;
const SETTLE_THRESHOLD = 0.01;

export function CameraAnimator() {
  const { camera } = useThree();
  const targetRef = useRef<CameraTarget | null>(null);
  const lerpPos = useRef(new Vector3());
  const lerpUp = useRef(new Vector3());

  useFrame(() => {
    // Pick up any new request from the HTML side.
    if (pendingTarget) {
      targetRef.current = pendingTarget;
      lerpPos.current.copy(camera.position);
      lerpUp.current.copy(camera.up);
      pendingTarget = null;
    }

    const t = targetRef.current;
    if (!t) return;

    // Lerp position
    lerpPos.current.lerp(t.position, LERP_FACTOR);
    camera.position.copy(lerpPos.current);

    // Lerp up vector and re-normalise
    lerpUp.current.lerp(t.up, LERP_FACTOR);
    lerpUp.current.normalize();
    camera.up.copy(lerpUp.current);

    // Always look at origin (OrbitControls target)
    camera.lookAt(0, 0, 0);

    // Stop animating once we've settled
    if (
      lerpPos.current.distanceTo(t.position) < SETTLE_THRESHOLD &&
      lerpUp.current.distanceTo(t.up) < SETTLE_THRESHOLD
    ) {
      camera.position.copy(t.position);
      camera.up.copy(t.up);
      camera.lookAt(0, 0, 0);
      targetRef.current = null;
    }
  });

  return null;
}

/* ------------------------------------------------------------------ */
/*  HTML overlay: must live OUTSIDE <Canvas>                          */
/* ------------------------------------------------------------------ */

const buttonSize = 28;

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  display: 'flex',
  flexDirection: 'column',
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
  width: buttonSize,
  height: buttonSize,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.10)',
  backgroundColor: 'rgba(255,255,255,0.05)',
  color: '#aaa',
  fontSize: 11,
  fontFamily: 'monospace',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 150ms, color 150ms, border-color 150ms',
  padding: 0,
  lineHeight: 1,
};

const hoverButtonStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.14)',
  color: '#ddd',
  borderColor: 'rgba(255,255,255,0.22)',
};

export function ViewPresetButtons() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleClick = useCallback((preset: ViewPreset) => {
    requestCameraMove(preset);
  }, []);

  return (
    <div style={containerStyle}>
      {VIEW_PRESETS.map((preset, i) => (
        <button
          key={preset.abbr}
          title={preset.label}
          style={{
            ...baseButtonStyle,
            ...(hoveredIndex === i ? hoverButtonStyle : {}),
          }}
          onMouseEnter={() => setHoveredIndex(i)}
          onMouseLeave={() => setHoveredIndex(null)}
          onClick={() => handleClick(preset)}
        >
          {preset.abbr}
        </button>
      ))}
    </div>
  );
}
