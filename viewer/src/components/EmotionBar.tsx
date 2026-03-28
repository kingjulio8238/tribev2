import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EmotionBarProps {
  emotions: Array<{
    name: string;
    intensity: number; // 0 to 1
  }>;
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
/*  Gradient — cool-to-warm emotional palette                         */
/* ------------------------------------------------------------------ */

const EMOTION_GRADIENT =
  'linear-gradient(to right, #2B4162, #3E6990, #5998C5, #8FC1E3, #C4DEF6, #F0E6D3, #F4C77D, #E8985E, #D66853, #B83B5E)';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EmotionBar({ emotions }: EmotionBarProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Don't render if no emotion data
  if (!emotions || emotions.every((e) => e.intensity === 0)) return null;

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>Emotional Response</div>
      <div style={rowsContainerStyle}>
        {emotions.map((emotion, i) => {
          const isHovered = hoveredIndex === i;
          const pct = Math.round(emotion.intensity * 100);

          return (
            <div
              key={emotion.name}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '4px 6px',
                borderRadius: 6,
                backgroundColor: isHovered
                  ? 'rgba(0, 0, 0, 0.02)'
                  : 'transparent',
                transition: 'background-color 150ms',
              }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Label */}
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 500,
                  color: '#5A5F70',
                  width: 80,
                  flexShrink: 0,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {emotion.name}
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
                {/* Bar fill — emotional palette gradient */}
                <div
                  style={{
                    height: '100%',
                    width: `${emotion.intensity * 100}%`,
                    background: EMOTION_GRADIENT,
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
                  color: '#8B90A0',
                  width: 36,
                  textAlign: 'right',
                  flexShrink: 0,
                  lineHeight: 1,
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
