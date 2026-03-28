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
  borderRadius: 8,
  backgroundColor: '#FFFFFF',
  border: '1px solid #D8DBE4',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
  color: '#1A1D26',
  fontSize: 11,
  lineHeight: 1.5,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  whiteSpace: 'nowrap',
  maxWidth: 280,
};

const labelStyle: React.CSSProperties = {
  color: '#8B90A0',
  fontSize: 10,
  marginRight: 6,
};

const valueStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  color: '#C67B2E',
  fontSize: 11,
  fontWeight: 500,
};

const regionStyle: React.CSSProperties = {
  color: '#1A1D26',
  fontWeight: 600,
  fontSize: 12,
};

const hemiStyle: React.CSSProperties = {
  color: '#8B90A0',
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
