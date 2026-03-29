export interface DemoConfig {
  id: string;
  name: string;
  description: string;
  basePath: string;
  hasVideo: boolean;
}

// R2 bucket URL for shared demos (set via env var at build time)
const R2_BASE_URL = import.meta.env.VITE_R2_BASE_URL || '';

export const DEMOS: DemoConfig[] = [
  {
    id: 'sintel',
    name: 'Sintel Trailer',
    description: 'Brain response to Sintel animated trailer',
    basePath: '/data',
    hasVideo: true,
  },
  {
    id: 'budlight',
    name: 'Bud Light Super Bowl',
    description: 'Brain response to Bud Light Super Bowl ad',
    basePath: '/data_budlight',
    hasVideo: true,
  },
];

export const DEFAULT_DEMO = DEMOS[0];

/**
 * Resolve a demo ID to a DemoConfig.
 * If the ID matches a built-in demo, return it.
 * Otherwise, treat it as a share ID and build a remote config.
 */
export function resolveDemo(demoId: string): DemoConfig {
  const found = DEMOS.find((d) => d.id === demoId);
  if (found) return found;

  // Shared demo — load from R2
  return {
    id: demoId,
    name: 'Shared Demo',
    description: '',
    basePath: R2_BASE_URL ? `${R2_BASE_URL}/${demoId}` : `/data/${demoId}`,
    hasVideo: true,
  };
}
