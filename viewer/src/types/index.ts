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
