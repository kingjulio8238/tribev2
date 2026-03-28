import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RegionActivityBarProps {
  regions: Array<{
    name: string;
    activation: number; // 0 to 1
    cameraPosition: [number, number, number];
    cameraUp: [number, number, number];
  }>;
  activeIndex: number | null;
  onRegionClick: (index: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const containerStyle: React.CSSProperties = {
  flexShrink: 0,
  backgroundColor: '#FFFFFF',
  borderTop: '1px solid #E8EAF0',
  padding: '10px 20px',
  pointerEvents: 'auto' as const,
};

const titleStyle: React.CSSProperties = {
  fontSize: 9,
  fontFamily: "'JetBrains Mono', monospace",
  fontWeight: 600,
  color: '#8B90A0',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  textAlign: 'center',
  marginBottom: 8,
};

const rowsContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function RegionActivityBar({
  regions,
  activeIndex,
  onRegionClick,
}: RegionActivityBarProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>Brain Region Activity</div>
      <div style={rowsContainerStyle}>
        {regions.map((region, i) => {
          const isActive = activeIndex === i;
          const isHovered = hoveredIndex === i;
          const pct = Math.round(region.activation * 100);

          return (
            <div
              key={region.name}
              role="button"
              tabIndex={0}
              aria-label={`${region.name} — ${pct}% activation`}
              aria-pressed={isActive}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '4px 6px',
                borderRadius: 6,
                cursor: 'pointer',
                backgroundColor: isActive
                  ? 'rgba(26, 29, 38, 0.04)'
                  : isHovered
                    ? 'rgba(0, 0, 0, 0.02)'
                    : 'transparent',
                transition: 'background-color 150ms',
                outline: 'none',
              }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => onRegionClick(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRegionClick(i);
                }
              }}
            >
              {/* Label */}
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#1A1D26' : '#5A5F70',
                  width: 80,
                  flexShrink: 0,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  transition: 'color 150ms',
                }}
              >
                {isActive ? '\u2022 ' : ''}
                {region.name}
              </span>

              {/* Bar container */}
              <div
                style={{
                  flex: 1,
                  height: 8,
                  backgroundColor: '#E4E6EC',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                {/* Bar fill — fire colormap gradient */}
                <div
                  style={{
                    height: '100%',
                    width: `${region.activation * 100}%`,
                    background: 'linear-gradient(to right, #000000, #591500, #bf2600, #f27308, #ffbf33, #ffffd9)',
                    borderRadius: 4,
                    transition: 'width 150ms ease-out',
                  }}
                />
              </div>

              {/* Value */}
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 500,
                  color: isActive ? '#1A1D26' : '#8B90A0',
                  width: 36,
                  textAlign: 'right',
                  flexShrink: 0,
                  lineHeight: 1,
                  transition: 'color 150ms',
                }}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
