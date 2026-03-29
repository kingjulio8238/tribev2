export interface BrainMeshData {
  vertices: Float32Array;
  faces: Uint32Array;
  sulcalDepth: Float32Array;
}

export interface PredictionData {
  data: Float32Array;
  nTimesteps: number;
  nVertices: number;
}

export interface Metadata {
  nTimesteps: number;
  nVertices: number;
  trSeconds: number;
  vmin: number;
  alphaScale: number;
}

export interface SegmentInfo {
  time: number;
  hasEvents: boolean;
  words: { text: string; start: number; end: number }[];
}

export interface ROIData {
  vertexLabels: Uint16Array;
  roiNames: string[];
}

export interface EmotionTimestep {
  time: number;
  emotions: Record<string, number>; // emotion name → intensity 0-1
}

export type EmotionData = EmotionTimestep[];

export interface KeyMoment {
  time: number;
  endTime: number;
  label: string;
  engagement: number;
  dominantEmotions: string[];
  alignsWithObjective: boolean;
  insight: string;
}

export interface ReportData {
  title: string;
  overallScore: number;
  summary: string;
  emotionalArc: {
    intended: string[];
    actual: string[];
    alignment: number;
  };
  keyMoments: KeyMoment[];
  brainInsights: string[];
  recommendations: string[];
}
