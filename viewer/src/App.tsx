import { useRef } from 'react';
import { ABComparisonView } from './components/ABComparisonView';
import { SingleView } from './components/SingleView';
import { DEFAULT_DEMO, resolveDemo } from './utils/demos';
import type { DemoConfig } from './utils/demos';

/** Parse URL search params for deep-link / sharing support. */
function parseShareParams(): {
  demo: DemoConfig;
  initialTime: number | null;
  initialCameraPosition: [number, number, number] | null;
  abMode: { a: DemoConfig; b: DemoConfig } | null;
} {
  const params = new URLSearchParams(window.location.search);
  let demo = DEFAULT_DEMO;
  let initialTime: number | null = null;
  let initialCameraPosition: [number, number, number] | null = null;
  let abMode: { a: DemoConfig; b: DemoConfig } | null = null;

  // A/B comparison mode
  const aParam = params.get('a');
  const bParam = params.get('b');
  if (aParam && bParam) {
    abMode = { a: resolveDemo(aParam), b: resolveDemo(bParam) };
  }

  const demoParam = params.get('demo');
  if (demoParam) {
    demo = resolveDemo(demoParam);
  }

  const tParam = params.get('t');
  if (tParam !== null) {
    const parsed = parseFloat(tParam);
    if (Number.isFinite(parsed) && parsed >= 0) {
      initialTime = parsed;
    }
  }

  const viewParam = params.get('view');
  if (viewParam) {
    const parts = viewParam.split(',').map(Number);
    if (
      parts.length === 3 &&
      parts.every((n) => Number.isFinite(n))
    ) {
      initialCameraPosition = parts as [number, number, number];
    }
  }

  return { demo, initialTime, initialCameraPosition, abMode };
}

export function App() {
  const shareParams = useRef(parseShareParams());

  if (shareParams.current.abMode) {
    const { a, b } = shareParams.current.abMode;
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundColor: '#FFFFFF', overflow: 'hidden', padding: 12 }}>
        <div style={{ width: '100%', height: '100%', backgroundColor: '#FFFFFF', border: '1px solid #E8EAF0', borderRadius: 12, overflow: 'hidden' }}>
          <ABComparisonView
            demoA={a}
            demoB={b}
            onBack={() => { window.location.href = window.location.pathname; }}
          />
        </div>
      </div>
    );
  }

  return (
    <SingleView
      demo={shareParams.current.demo}
      initialTime={shareParams.current.initialTime}
      initialCameraPosition={shareParams.current.initialCameraPosition ?? undefined}
    />
  );
}
