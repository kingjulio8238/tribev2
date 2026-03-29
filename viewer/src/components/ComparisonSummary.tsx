import type { ReportData, EmotionData } from '../types/index.ts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ComparisonSummaryProps {
  reportA: ReportData | null;
  reportB: ReportData | null;
  emotionsA: EmotionData | null;
  emotionsB: EmotionData | null;
  lobeActivationsA: Record<string, number>; // mean per lobe
  lobeActivationsB: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: '#8B90A0',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 10,
  ...mono,
};

/* ------------------------------------------------------------------ */
/*  Delta bar                                                          */
/* ------------------------------------------------------------------ */

function DeltaBar({
  label,
  valueA,
  valueB,
  gradient,
}: {
  label: string;
  valueA: number;
  valueB: number;
  gradient: string;
}) {
  const pctA = Math.round(valueA * 100);
  const pctB = Math.round(valueB * 100);
  const delta = pctB - pctA;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
      <span style={{ fontSize: 10, color: '#5A5F70', width: 70, flexShrink: 0, ...mono }}>
        {label}
      </span>
      {/* Bar A */}
      <span style={{ fontSize: 9, color: '#8B90A0', width: 28, textAlign: 'right', flexShrink: 0, ...mono }}>
        {pctA}%
      </span>
      <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }}>
        <div style={{ flex: 1, height: 6, backgroundColor: '#E4E6EC', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${valueA * 100}%`, background: gradient, borderRadius: 3, opacity: 0.6 }} />
        </div>
        <div style={{ flex: 1, height: 6, backgroundColor: '#E4E6EC', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${valueB * 100}%`, background: gradient, borderRadius: 3 }} />
        </div>
      </div>
      <span style={{ fontSize: 9, color: '#8B90A0', width: 28, flexShrink: 0, ...mono }}>
        {pctB}%
      </span>
      {/* Delta */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          width: 36,
          textAlign: 'right',
          flexShrink: 0,
          color: delta > 0 ? '#1B7A3D' : delta < 0 ? '#B83B3B' : '#8B90A0',
          ...mono,
        }}
      >
        {delta > 0 ? '+' : ''}{delta}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Score comparison                                                    */
/* ------------------------------------------------------------------ */

function ScoreCompare({ label, valueA, valueB, suffix }: {
  label: string;
  valueA: number | string;
  valueB: number | string;
  suffix?: string;
}) {
  const numA = typeof valueA === 'number' ? valueA : parseFloat(String(valueA));
  const numB = typeof valueB === 'number' ? valueB : parseFloat(String(valueB));
  const delta = numB - numA;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <span style={{ fontSize: 10, color: '#5A5F70', width: 130, flexShrink: 0, ...mono }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1D26', width: 60, textAlign: 'center', ...mono }}>
        {valueA}{suffix}
      </span>
      <span style={{ fontSize: 10, color: '#8B90A0', ...mono }}>vs</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1D26', width: 60, textAlign: 'center', ...mono }}>
        {valueB}{suffix}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: delta > 0 ? '#1B7A3D' : delta < 0 ? '#B83B3B' : '#8B90A0',
          ...mono,
        }}
      >
        {delta > 0 ? '+' : ''}{Math.round(delta)}{suffix}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const FIRE_GRADIENT = 'linear-gradient(to right, #000000, #591500, #bf2600, #f27308, #ffbf33, #ffffd9)';
const EMOTION_GRADIENT = 'linear-gradient(to right, #2B4162, #3E6990, #5998C5, #8FC1E3, #C4DEF6, #F0E6D3, #F4C77D, #E8985E, #D66853, #B83B5E)';

export function ComparisonSummary({
  reportA,
  reportB,
  emotionsA,
  emotionsB,
  lobeActivationsA,
  lobeActivationsB,
}: ComparisonSummaryProps) {

  // Compute mean emotions across all timesteps
  const emotionMeansA = computeEmotionMeans(emotionsA);
  const emotionMeansB = computeEmotionMeans(emotionsB);

  // Get all lobe names
  const lobeNames = Array.from(new Set([...Object.keys(lobeActivationsA), ...Object.keys(lobeActivationsB)]));
  const emotionNames = Array.from(new Set([...Object.keys(emotionMeansA), ...Object.keys(emotionMeansB)]));

  return (
    <div style={{ padding: '16px 20px', ...mono }}>
      {/* Header */}
      <div style={{ ...sectionTitleStyle, textAlign: 'center', fontSize: 10, marginBottom: 16 }}>
        Comparison Summary
      </div>

      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
        <span style={{ fontSize: 10, color: '#8B90A0', ...mono }}>
          A: {reportA?.title || 'Video A'}
        </span>
        <span style={{ fontSize: 10, color: '#8B90A0', ...mono }}>
          B: {reportB?.title || 'Video B'}
        </span>
      </div>

      {/* Score comparison */}
      {reportA && reportB && (
        <div style={{ marginBottom: 16, borderBottom: '1px solid #F0F1F4', paddingBottom: 12 }}>
          <ScoreCompare
            label="Overall Score"
            valueA={reportA.overallScore}
            valueB={reportB.overallScore}
            suffix="/100"
          />
          <ScoreCompare
            label="Emotional Alignment"
            valueA={Math.round(reportA.emotionalArc.alignment * 100)}
            valueB={Math.round(reportB.emotionalArc.alignment * 100)}
            suffix="%"
          />
        </div>
      )}

      {/* Brain region comparison */}
      {lobeNames.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...sectionTitleStyle, display: 'flex', justifyContent: 'space-between' }}>
            <span>Brain Region Comparison</span>
            <span style={{ fontSize: 8, color: '#B0B5C3' }}>A vs B (mean activation)</span>
          </div>
          {lobeNames.map((lobe) => (
            <DeltaBar
              key={lobe}
              label={lobe}
              valueA={lobeActivationsA[lobe] || 0}
              valueB={lobeActivationsB[lobe] || 0}
              gradient={FIRE_GRADIENT}
            />
          ))}
        </div>
      )}

      {/* Emotion comparison */}
      {emotionNames.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...sectionTitleStyle, display: 'flex', justifyContent: 'space-between' }}>
            <span>Emotion Comparison</span>
            <span style={{ fontSize: 8, color: '#B0B5C3' }}>A vs B (mean intensity)</span>
          </div>
          {emotionNames.map((emo) => (
            <DeltaBar
              key={emo}
              label={emo}
              valueA={emotionMeansA[emo] || 0}
              valueB={emotionMeansB[emo] || 0}
              gradient={EMOTION_GRADIENT}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function computeEmotionMeans(data: EmotionData | null): Record<string, number> {
  if (!data || data.length === 0) return {};
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const step of data) {
    if (!step.emotions) continue;
    for (const [name, value] of Object.entries(step.emotions)) {
      sums[name] = (sums[name] || 0) + value;
      counts[name] = (counts[name] || 0) + 1;
    }
  }
  const means: Record<string, number> = {};
  for (const name of Object.keys(sums)) {
    means[name] = sums[name] / counts[name];
  }
  return means;
}
