interface ColorBarProps {
  vmin?: number;
}

export function ColorBar({ vmin = 0.5 }: ColorBarProps) {
  const barWidth = 12;
  const barHeight = 140;

  // Fire colormap gradient stops (colorcet fire) - top is high, bottom is low
  const fireStops = [
    { offset: 0, color: '#ffffd9' },   // near white (high)
    { offset: 0.2, color: '#ffbf33' }, // yellow-orange
    { offset: 0.4, color: '#f27308' }, // orange
    { offset: 0.6, color: '#bf2600' }, // red-orange
    { offset: 0.8, color: '#590000' }, // dark red
    { offset: 1.0, color: '#000000' }, // black (low)
  ];

  const gradientCSS = fireStops
    .map((s) => `${s.color} ${s.offset * 100}%`)
    .join(', ');

  // vmin position: 0 = bottom (low), 1 = top (high)
  // In CSS top-down layout: position from top = (1 - vmin) * 100%
  const vminFromTop = (1 - vmin) * barHeight;

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        background: 'rgba(10, 10, 18, 0.75)',
        borderRadius: 6,
        border: '1px solid rgba(100, 100, 140, 0.2)',
        padding: '10px 10px 10px 10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {/* Title */}
      <span
        style={{
          fontSize: 9,
          fontFamily: 'monospace',
          color: '#8888aa',
          letterSpacing: '0.12em',
          fontVariant: 'all-small-caps',
          fontWeight: 600,
        }}
      >
        Activation
      </span>

      {/* Main bar area */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          height: barHeight,
        }}
      >
        {/* Left labels column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            height: barHeight,
            marginRight: 5,
            position: 'relative',
          }}
        >
          <span
            style={{
              fontSize: 8,
              fontFamily: 'monospace',
              color: '#7a7a9a',
              lineHeight: 1,
            }}
          >
            High
          </span>
          <span
            style={{
              fontSize: 8,
              fontFamily: 'monospace',
              color: '#7a7a9a',
              lineHeight: 1,
            }}
          >
            Low
          </span>
        </div>

        {/* Gradient bar with dimmed region below vmin */}
        <div
          style={{
            position: 'relative',
            width: barWidth,
            height: barHeight,
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid rgba(100, 100, 140, 0.25)',
          }}
        >
          {/* Full gradient */}
          <div
            style={{
              width: '100%',
              height: '100%',
              background: `linear-gradient(to bottom, ${gradientCSS})`,
            }}
          />
          {/* Dimmed overlay below vmin */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: vminFromTop,
              width: '100%',
              height: barHeight - vminFromTop,
              background: 'rgba(0, 0, 0, 0.55)',
            }}
          />
          {/* vmin tick mark */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: vminFromTop,
              width: '100%',
              height: 1,
              background: '#8888aa',
            }}
          />
        </div>

        {/* Right side: vmin label */}
        <div
          style={{
            position: 'relative',
            height: barHeight,
            marginLeft: 4,
          }}
        >
          {/* Tick extending from bar */}
          <div
            style={{
              position: 'absolute',
              top: vminFromTop,
              left: 0,
              width: 4,
              height: 1,
              background: '#8888aa',
            }}
          />
          {/* Threshold label */}
          <span
            style={{
              position: 'absolute',
              top: vminFromTop - 5,
              left: 6,
              fontSize: 7,
              fontFamily: 'monospace',
              color: '#7a7a9a',
              whiteSpace: 'nowrap',
              lineHeight: 1,
            }}
          >
            threshold
          </span>
        </div>
      </div>
    </div>
  );
}
