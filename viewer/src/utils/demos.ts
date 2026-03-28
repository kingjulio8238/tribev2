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
];

export const DEFAULT_DEMO = DEMOS[0];
