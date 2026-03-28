import { useRef, useEffect, useCallback } from 'react';

interface WaveformProps {
  currentTime: number;
  duration: number;
  onClick?: (time: number) => void;
}

/**
 * Generates a deterministic synthetic waveform based on a seed.
 * Returns an array of amplitude values (0..1).
 */
function generateSyntheticWaveform(numBars: number): number[] {
  const bars: number[] = [];
  // Simple seeded pseudo-random for consistency across renders
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed & 0x7fffffff) / 0x7fffffff;
  };
  for (let i = 0; i < numBars; i++) {
    // Create a natural-looking waveform with varying amplitude
    const base = 0.15 + rand() * 0.55;
    const envelope = 0.5 + 0.5 * Math.sin((i / numBars) * Math.PI * 6);
    bars.push(Math.min(1, base * (0.4 + 0.6 * envelope)));
  }
  return bars;
}

function formatTimeLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Waveform({ currentTime, duration, onClick }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<number[] | null>(null);
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);

  // Keep refs in sync
  currentTimeRef.current = currentTime;
  durationRef.current = duration;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ct = currentTimeRef.current;
    const dur = durationRef.current;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Generate bars if needed
    const numBars = Math.max(1, Math.floor(width / 3));
    if (!barsRef.current || barsRef.current.length !== numBars) {
      barsRef.current = generateSyntheticWaveform(numBars);
    }
    const bars = barsRef.current;

    // Draw bars
    const barWidth = width / numBars;
    const maxBarHeight = height * 0.75;
    const playheadX = dur > 0 ? (ct / dur) * width : 0;

    for (let i = 0; i < numBars; i++) {
      const x = i * barWidth;
      const barH = bars[i] * maxBarHeight;
      const y = (height - barH) / 2;

      // Bars before playhead are brighter
      if (x < playheadX) {
        ctx.fillStyle = '#1A1D26';
      } else {
        ctx.fillStyle = '#CDD1DB';
      }

      const gap = Math.max(0.5, barWidth * 0.2);
      ctx.fillRect(x + gap / 2, y, barWidth - gap, barH);
    }

    // Draw playhead
    if (dur > 0) {
      ctx.fillStyle = '#E8622C';
      ctx.fillRect(playheadX - 1, 0, 2, height);

      // Small triangle at top
      ctx.beginPath();
      ctx.moveTo(playheadX - 4, 0);
      ctx.lineTo(playheadX + 4, 0);
      ctx.lineTo(playheadX, 6);
      ctx.closePath();
      ctx.fillStyle = '#E8622C';
      ctx.fill();
    }

    // Gradient fade at left edge
    const fadeWidth = 24;
    const leftGrad = ctx.createLinearGradient(0, 0, fadeWidth, 0);
    leftGrad.addColorStop(0, '#FFFFFF');
    leftGrad.addColorStop(1, 'rgba(240, 241, 244, 0)');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, fadeWidth, height);

    // Gradient fade at right edge
    const rightGrad = ctx.createLinearGradient(width - fadeWidth, 0, width, 0);
    rightGrad.addColorStop(0, 'rgba(240, 241, 244, 0)');
    rightGrad.addColorStop(1, '#FFFFFF');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(width - fadeWidth, 0, fadeWidth, height);

    // Time labels
    ctx.font = '9px monospace';
    ctx.textBaseline = 'bottom';
    // Start label
    ctx.fillStyle = '#8B90A0';
    ctx.textAlign = 'left';
    ctx.fillText(formatTimeLabel(0), 4, height - 3);
    // End label
    if (dur > 0) {
      ctx.textAlign = 'right';
      ctx.fillText(formatTimeLabel(dur), width - 4, height - 3);
    }

    // Subtle border at bottom
    ctx.fillStyle = '#E8EAF0';
    ctx.fillRect(0, height - 1, width, 1);
  }, []);

  // Redraw when currentTime or duration changes
  useEffect(() => {
    draw();
  }, [currentTime, duration, draw]);

  // Redraw on resize (stable — does not depend on currentTime/duration)
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      barsRef.current = null; // regenerate bars on resize
      draw();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onClick || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onClick(fraction * duration);
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: '#FFFFFF',
      }}
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: onClick ? 'pointer' : 'default',
        }}
      />
    </div>
  );
}
