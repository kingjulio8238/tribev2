import { useState } from 'react';
import type { ReportData } from '../types/index.ts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReportPanelProps {
  report: ReportData;
  onSeek: (time: number) => void;
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
  cursor: 'pointer',
  userSelect: 'none',
};

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

/* ------------------------------------------------------------------ */
/*  Score badge                                                        */
/* ------------------------------------------------------------------ */

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? '#1B7A3D' : score >= 50 ? '#B87A14' : '#B83B3B';
  const bg =
    score >= 75
      ? 'rgba(27, 122, 61, 0.08)'
      : score >= 50
        ? 'rgba(184, 122, 20, 0.08)'
        : 'rgba(184, 59, 59, 0.08)';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 6,
        backgroundColor: bg,
        ...mono,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 700, color }}>{score}</span>
      <span style={{ fontSize: 10, color: '#8B90A0' }}>/100</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ReportPanel({ report, onSeek }: ReportPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={containerStyle}>
      <div
        style={titleStyle}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '▾' : '▸'} Effectiveness Report
      </div>

      {/* Collapsed: just score + summary */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: expanded ? 12 : 0,
        }}
      >
        <ScoreBadge score={report.overallScore} />
        <p
          style={{
            fontSize: 11,
            color: '#5A5F70',
            lineHeight: 1.5,
            margin: 0,
            ...mono,
          }}
        >
          {report.summary}
        </p>
      </div>

      {/* Expanded: full report */}
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>

          {/* Emotional Arc */}
          <Section title="Emotional Arc">
            <div style={{ display: 'flex', gap: 16, fontSize: 11, ...mono }}>
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
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D26' }}>
                  {Math.round(report.emotionalArc.alignment * 100)}%
                </span>
              </div>
            </div>
          </Section>

          {/* Key Moments */}
          <Section title="Key Moments">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {report.keyMoments.map((m, i) => (
                <div
                  key={i}
                  onClick={() => onSeek(m.time)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'background-color 150ms',
                    backgroundColor: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: '#8B90A0',
                      width: 50,
                      flexShrink: 0,
                      ...mono,
                    }}
                  >
                    {formatTime(m.time)}-{formatTime(m.endTime)}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      flexShrink: 0,
                      width: 14,
                      textAlign: 'center',
                    }}
                  >
                    {m.alignsWithObjective ? '✓' : '✗'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1A1D26', ...mono }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: 10, color: '#5A5F70', marginTop: 2, ...mono }}>
                      {m.insight}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: '#8B90A0',
                      flexShrink: 0,
                      ...mono,
                    }}
                  >
                    {Math.round(m.engagement * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* Brain Insights */}
          <Section title="Brain Insights">
            <ul style={{ margin: 0, paddingLeft: 16, ...mono }}>
              {report.brainInsights.map((insight, i) => (
                <li key={i} style={{ fontSize: 10, color: '#5A5F70', marginBottom: 4, lineHeight: 1.5 }}>
                  {insight}
                </li>
              ))}
            </ul>
          </Section>

          {/* Recommendations */}
          <Section title="Recommendations">
            <ul style={{ margin: 0, paddingLeft: 16, ...mono }}>
              {report.recommendations.map((rec, i) => (
                <li key={i} style={{ fontSize: 10, color: '#5A5F70', marginBottom: 4, lineHeight: 1.5 }}>
                  {rec}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: '#8B90A0',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 6,
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
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 3,
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
