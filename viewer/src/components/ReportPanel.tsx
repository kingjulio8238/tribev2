import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { BrainMesh } from './BrainMesh';
import type { ReportData, BrainMeshData, PredictionData, Metadata } from '../types/index.ts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReportPanelProps {
  report: ReportData;
  basePath: string;
  meshData: BrainMeshData | null;
  predictions: PredictionData | null;
  metadata: Metadata | null;
  onSeek: (time: number) => void;
  onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

/* ------------------------------------------------------------------ */
/*  Moment Preview (thumbnail + brain snapshot)                        */
/* ------------------------------------------------------------------ */

function MomentPreview({
  time,
  basePath,
  meshData,
  predictions,
  metadata,
}: {
  time: number;
  basePath: string;
  meshData: BrainMeshData | null;
  predictions: PredictionData | null;
  metadata: Metadata | null;
}) {
  const trSeconds = metadata?.trSeconds ?? 1;
  const timestepIndex = Math.min(
    Math.max(Math.floor(time / trSeconds), 0),
    (metadata?.nTimesteps ?? 1) - 1,
  );
  const thumbIdx = String(timestepIndex).padStart(5, '0');
  const thumbUrl = `${basePath}/stimulus/thumbnails/frame_${thumbIdx}.jpg`;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 0',
        borderTop: '1px solid #F0F1F4',
      }}
    >
      {/* Video thumbnail */}
      <div
        style={{
          flex: 1,
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid #E8EAF0',
          backgroundColor: '#F8F9FA',
          minHeight: 160,
        }}
      >
        <img
          src={thumbUrl}
          alt={`Frame at ${formatTime(time)}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* Brain snapshot */}
      <div
        style={{
          flex: 1,
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid #E8EAF0',
          backgroundColor: '#FFFFFF',
          minHeight: 160,
        }}
      >
        {meshData && predictions && metadata ? (
          <Canvas
            camera={{ position: [0, 250, 0], fov: 50, up: [0, 0, 1] }}
            gl={{ alpha: true }}
            style={{ width: '100%', height: '100%', background: '#FFFFFF' }}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[100, 100, 100]} intensity={0.7} />
            <directionalLight position={[-60, -60, 40]} intensity={0.25} />
            <BrainMesh
              timestepIndex={timestepIndex}
              currentTime={time}
              trSeconds={trSeconds}
              meshData={meshData}
              predictions={predictions}
              metadata={metadata}
            />
          </Canvas>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8B90A0',
              fontSize: 11,
              ...mono,
            }}
          >
            Brain data not available
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Score badge                                                        */
/* ------------------------------------------------------------------ */

function ScoreBadge({ score }: { score: number }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, ...mono }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1D26' }}>{score}/100</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ReportPanel({
  report,
  basePath,
  meshData,
  predictions,
  metadata,
  onSeek,
  onBack,
}: ReportPanelProps) {
  const [expandedMoment, setExpandedMoment] = useState<number | null>(null);

  return (
    <div style={{ padding: '20px 24px', ...mono }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: '1px solid #D8DBE4',
          borderRadius: 6,
          padding: '4px 12px',
          fontSize: 11,
          color: '#5A5F70',
          cursor: 'pointer',
          marginBottom: 16,
          ...mono,
        }}
      >
        ← Back to Brain View
      </button>

      {/* Title */}
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: '#8B90A0',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          textAlign: 'center',
          marginBottom: 16,
        }}
      >
        Effectiveness Report
      </div>

      {/* Score + Summary */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <ScoreBadge score={report.overallScore} />
        <p
          style={{
            fontSize: 12,
            color: '#4A4E5A',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {report.summary}
        </p>
      </div>

      {/* Emotional Arc */}
      <Section title="Emotional Arc">
        <div style={{ display: 'flex', gap: 20, fontSize: 11, flexWrap: 'wrap' }}>
          <div>
            <Label>Intended</Label>
            <TagList tags={report.emotionalArc.intended} color="#2B7A83" />
          </div>
          <div>
            <Label>Actual</Label>
            <TagList tags={report.emotionalArc.actual} color="#B87A14" />
          </div>
          <div>
            <Label>Alignment</Label>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1D26' }}>
              {Math.round(report.emotionalArc.alignment * 100)}%
            </span>
          </div>
        </div>
      </Section>

      {/* Key Moments */}
      <Section title="Key Moments">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {report.keyMoments.map((m, i) => {
            const isExpanded = expandedMoment === i;
            return (
              <div key={i}>
                <div
                  onClick={() => setExpandedMoment(isExpanded ? null : i)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'background-color 150ms',
                    backgroundColor: isExpanded ? 'rgba(0,0,0,0.03)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.02)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span style={{ fontSize: 10, color: '#2B7A83', width: 55, flexShrink: 0, fontWeight: 600 }}>
                    {formatTime(m.time)}-{formatTime(m.endTime)}
                  </span>
                  <span style={{ fontSize: 11, flexShrink: 0, width: 14, textAlign: 'center', color: m.alignsWithObjective ? '#1B7A3D' : '#B83B3B' }}>
                    {m.alignsWithObjective ? '✓' : '✗'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1A1D26' }}>
                      {isExpanded ? '▾ ' : '▸ '}{m.label}
                    </div>
                    <div style={{ fontSize: 10, color: '#5A5F70', marginTop: 3, lineHeight: 1.5 }}>
                      {m.insight}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: '#8B90A0', flexShrink: 0 }}>
                    {Math.round(m.engagement * 100)}%
                  </span>
                </div>

                {/* Expanded: thumbnail + brain preview */}
                {isExpanded && (
                  <div style={{ padding: '0 10px 8px 10px' }}>
                    <MomentPreview
                      time={m.time}
                      basePath={basePath}
                      meshData={meshData}
                      predictions={predictions}
                      metadata={metadata}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeek(m.time);
                      }}
                      style={{
                        background: 'none',
                        border: '1px solid #D8DBE4',
                        borderRadius: 4,
                        padding: '3px 10px',
                        fontSize: 10,
                        color: '#5A5F70',
                        cursor: 'pointer',
                        marginTop: 6,
                        ...mono,
                      }}
                    >
                      ▶ Play from this moment
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Brain Insights */}
      <Section title="Brain Insights">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {report.brainInsights.map((insight, i) => (
            <li key={i} style={{ fontSize: 11, color: '#4A4E5A', marginBottom: 6, lineHeight: 1.6 }}>
              {insight}
            </li>
          ))}
        </ul>
      </Section>

      {/* Recommendations */}
      <Section title="Recommendations">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {report.recommendations.map((rec, i) => (
            <li key={i} style={{ fontSize: 11, color: '#4A4E5A', marginBottom: 6, lineHeight: 1.6 }}>
              {rec}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: '#8B90A0',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 8,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        color: '#8B90A0',
        marginBottom: 4,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {children}
    </div>
  );
}

function TagList({ tags, color }: { tags: string[]; color: string }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 4,
            backgroundColor: `${color}14`,
            color,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
