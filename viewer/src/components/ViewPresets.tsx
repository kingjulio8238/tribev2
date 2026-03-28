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
  { label: 'Temporal', abbr: 'L', position: [-300, 0, 0], up: [0, 0, 1] },
  { label: 'Parietal', abbr: 'R', position: [300, 0, 0], up: [0, 0, 1] },
  { label: 'Dorsal', abbr: 'D', position: [0, 0, 300], up: [0, 1, 0] },
  { label: 'Ventral', abbr: 'V', position: [0, 0, -300], up: [0, -1, 0] },
  { label: 'Frontal', abbr: 'A', position: [0, 300, 0], up: [0, 0, 1] },
  { label: 'Occipital', abbr: 'P', position: [0, -300, 0], up: [0, 0, 1] },
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

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  flexDirection: 'row',
  gap: 4,
  padding: 4,
  borderRadius: 8,
  backgroundColor: '#FFFFFF',
  border: '1px solid #E8EAF0',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  zIndex: 10,
  pointerEvents: 'auto',
};

const baseButtonStyle: React.CSSProperties = {
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 5,
  border: '1px solid transparent',
  backgroundColor: 'transparent',
  color: '#5A5F70',
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background-color 150ms, color 150ms, border-color 150ms',
  outline: 'none',
  padding: '4px 10px',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

const hoverButtonStyle: React.CSSProperties = {
  backgroundColor: '#F4F5F7',
  color: '#1A1D26',
  borderColor: 'transparent',
};

const activeButtonStyle: React.CSSProperties = {
  backgroundColor: '#1A1D26',
  color: '#FFFFFF',
  border: '1px solid #1A1D26',
};

export function ViewPresetButtons() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const handleClick = useCallback((preset: ViewPreset, index: number) => {
    requestCameraMove(preset);
    setActiveIndex(index);
  }, []);

  return (
    <div style={containerStyle}>
      {VIEW_PRESETS.map((preset, i) => {
        const isActive = activeIndex === i;
        const isHovered = hoveredIndex === i && !isActive;
        return (
          <button
            key={preset.abbr}
            title={preset.label}
            style={{
              ...baseButtonStyle,
              ...(isActive ? activeButtonStyle : {}),
              ...(isHovered ? hoverButtonStyle : {}),
            }}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            onClick={(e) => { handleClick(preset, i); (e.target as HTMLElement).blur(); }}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
