export interface DemoConfig {
  id: string;
  name: string;
  description: string;
  basePath: string;
  hasVideo: boolean;
}

export const DEMOS: DemoConfig[] = [
  {
    id: 'synthetic',
    name: 'Synthetic Demo',
    description: 'Travelling wave across cortical surface',
    basePath: '/data',
    hasVideo: false,
  },
  {
    id: 'video-demo',
    name: 'Video Stimulus',
    description: 'Brain response to naturalistic video',
    basePath: '/data/demos/video',
    hasVideo: true,
  },
  {
    id: 'audio-demo',
    name: 'Audio Stimulus',
    description: 'Brain response to speech audio',
    basePath: '/data/demos/audio',
    hasVideo: false,
  },
];

export const DEFAULT_DEMO = DEMOS[0];
