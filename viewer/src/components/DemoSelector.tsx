import { useState, useRef, useEffect, useCallback } from 'react';
import type { DemoConfig } from '../utils/demos';

interface DemoSelectorProps {
  demos: DemoConfig[];
  current: DemoConfig;
  onChange: (demo: DemoConfig) => void;
}

export function DemoSelector({ demos, current, onChange }: DemoSelectorProps) {
  const [open, setOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleSelect = useCallback(
    (demo: DemoConfig) => {
      onChange(demo);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={containerRef} style={wrapperStyle}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          ...triggerStyle,
          ...(open ? triggerOpenStyle : {}),
        }}
      >
        <span style={triggerLabelStyle}>
          <span style={dotStyle} />
          {current.name}
        </span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          style={{
            transition: 'transform 200ms ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        >
          <path
            d="M1 1L5 5L9 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={dropdownStyle}>
          {demos.map((demo) => {
            const isActive = demo.id === current.id;
            const isHovered = demo.id === hoveredId;
            return (
              <button
                key={demo.id}
                onClick={() => handleSelect(demo)}
                onMouseEnter={() => setHoveredId(demo.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  ...optionStyle,
                  ...(isActive ? optionActiveStyle : {}),
                  ...(isHovered && !isActive ? optionHoverStyle : {}),
                }}
              >
                <div style={optionNameRow}>
                  {isActive && <span style={checkStyle}>&#10003;</span>}
                  <span
                    style={{
                      ...optionNameStyle,
                      ...(isActive ? { color: '#e0e0f0' } : {}),
                    }}
                  >
                    {demo.name}
                  </span>
                </div>
                <div style={optionDescStyle}>{demo.description}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const wrapperStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 20,
  pointerEvents: 'auto',
};

const triggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 12px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.08)',
  backgroundColor: 'rgba(15, 15, 25, 0.80)',
  backdropFilter: 'blur(8px)',
  color: '#999ab0',
  fontSize: 12,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background-color 150ms, border-color 150ms, color 150ms',
  whiteSpace: 'nowrap',
};

const triggerOpenStyle: React.CSSProperties = {
  backgroundColor: 'rgba(20, 20, 35, 0.92)',
  borderColor: 'rgba(255,255,255,0.14)',
  color: '#bbbcd0',
};

const triggerLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
};

const dotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  backgroundColor: '#5b8af0',
  flexShrink: 0,
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  minWidth: 240,
  padding: 4,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  backgroundColor: 'rgba(13, 13, 22, 0.95)',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const optionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '8px 10px',
  borderRadius: 5,
  border: 'none',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background-color 120ms',
  width: '100%',
};

const optionActiveStyle: React.CSSProperties = {
  backgroundColor: 'rgba(91, 138, 240, 0.12)',
};

const optionHoverStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.05)',
};

const optionNameRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const checkStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#5b8af0',
  lineHeight: 1,
};

const optionNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: '#aaabbf',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const optionDescStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#666780',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  lineHeight: 1.35,
  paddingLeft: 16,
};
