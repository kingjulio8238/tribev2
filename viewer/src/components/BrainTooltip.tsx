export interface BrainTooltipProps {
  visible: boolean;
  x: number;
  y: number;
  roiName: string;
  hemisphere: string;
  activation: number;
  containerWidth?: number;
  containerHeight?: number;
}

const tooltipStyle: React.CSSProperties = {
  position: 'absolute',
  pointerEvents: 'none',
  zIndex: 20,
  padding: '6px 10px',
  borderRadius: 6,
  backgroundColor: 'rgba(10, 10, 20, 0.88)',
  border: '1px solid rgba(255, 255, 255, 0.10)',
  backdropFilter: 'blur(8px)',
  color: '#ccc',
  fontSize: 11,
  lineHeight: 1.5,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  whiteSpace: 'nowrap',
  maxWidth: 280,
};

const labelStyle: React.CSSProperties = {
  color: '#999',
  fontSize: 10,
  marginRight: 6,
};

const valueStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  color: '#e8c46a',
  fontSize: 11,
};

const regionStyle: React.CSSProperties = {
  color: '#ddd',
  fontWeight: 500,
  fontSize: 11,
};

const hemiStyle: React.CSSProperties = {
  color: '#8888bb',
  fontSize: 10,
  marginLeft: 6,
};

export function BrainTooltip({
  visible,
  x,
  y,
  roiName,
  hemisphere,
  activation,
  containerWidth = Infinity,
  containerHeight = Infinity,
}: BrainTooltipProps) {
  if (!visible) return null;

  const TOOLTIP_W = 180;
  const TOOLTIP_H = 70;
  const OFFSET = 14;

  // Flip to left of cursor if too close to right edge
  let left = x + OFFSET;
  if (left + TOOLTIP_W > containerWidth) {
    left = x - OFFSET - TOOLTIP_W;
  }
  left = Math.max(0, Math.min(left, containerWidth - TOOLTIP_W));

  // Flip above cursor if too close to bottom edge
  let top = y - 10;
  if (top + TOOLTIP_H > containerHeight) {
    top = y - OFFSET - TOOLTIP_H;
  }
  top = Math.max(0, Math.min(top, containerHeight - TOOLTIP_H));

  return (
    <div
      style={{
        ...tooltipStyle,
        left,
        top,
      }}
    >
      <div>
        <span style={regionStyle}>{roiName}</span>
        <span style={hemiStyle}>{hemisphere}</span>
      </div>
      <div style={{ marginTop: 2 }}>
        <span style={labelStyle}>activation</span>
        <span style={valueStyle}>{activation.toFixed(4)}</span>
      </div>
    </div>
  );
}
