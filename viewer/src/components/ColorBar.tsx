interface ColorBarProps {
  vmin?: number;
}

export function ColorBar({ vmin = 0.5 }: ColorBarProps) {
  const barWidth = 200;
  const barHeight = 10;

  // Fire colormap gradient stops (colorcet fire) - left is low, right is high
  const fireStops = [
    { offset: 0, color: '#000000' },   // black (low)
    { offset: 0.2, color: '#590000' }, // dark red
    { offset: 0.4, color: '#bf2600' }, // red-orange
    { offset: 0.6, color: '#f27308' }, // orange
    { offset: 0.8, color: '#ffbf33' }, // yellow-orange
    { offset: 1.0, color: '#ffffd9' }, // near white (high)
  ];

  const gradientCSS = fireStops
    .map((s) => `${s.color} ${s.offset * 100}%`)
    .join(', ');

  // vmin position: 0 = left (low), 1 = right (high)
  const vminFromLeft = vmin * barWidth;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        background: '#FFFFFF',
        borderRadius: 8,
        border: '1px solid #E8EAF0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        padding: '8px 14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {/* Title */}
      <span
        style={{
          fontSize: 9,
          fontFamily: 'monospace',
          color: '#5A5F70',
          letterSpacing: '0.12em',
          fontVariant: 'all-small-caps',
          fontWeight: 600,
        }}
      >
        Activation
      </span>

      {/* Bar area with labels */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {/* Low label */}
        <span
          style={{
            fontSize: 8,
            fontFamily: 'monospace',
            color: '#8B90A0',
            lineHeight: 1,
          }}
        >
          Low
        </span>

        {/* Gradient bar with vmin tick */}
        <div
          style={{
            position: 'relative',
            width: barWidth,
            height: barHeight,
            borderRadius: 2,
            overflow: 'visible',
          }}
        >
          {/* Full gradient */}
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 2,
              overflow: 'hidden',
              border: '1px solid #D8DBE4',
              background: `linear-gradient(to right, ${gradientCSS})`,
            }}
          />
          {/* Dimmed overlay below vmin (left portion) */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: vminFromLeft,
              height: barHeight,
              background: 'rgba(255, 255, 255, 0.55)',
              borderRadius: '2px 0 0 2px',
            }}
          />
          {/* vmin tick mark (vertical line) */}
          <div
            style={{
              position: 'absolute',
              left: vminFromLeft,
              top: -2,
              width: 1,
              height: barHeight + 4,
              background: '#8B90A0',
            }}
          />
        </div>

        {/* High label */}
        <span
          style={{
            fontSize: 8,
            fontFamily: 'monospace',
            color: '#8B90A0',
            lineHeight: 1,
          }}
        >
          High
        </span>
      </div>
    </div>
  );
}
