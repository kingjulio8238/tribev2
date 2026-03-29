export interface DemoConfig {
  id: string;
  name: string;
  description: string;
  basePath: string;
  hasVideo: boolean;
}

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
