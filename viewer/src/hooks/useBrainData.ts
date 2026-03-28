import { useState, useEffect } from 'react';
import type {
  BrainMeshData,
  PredictionData,
  Metadata,
  SegmentInfo,
  ROIData,
} from '../types/index.ts';

interface UseBrainDataReturn {
  meshData: BrainMeshData | null;
  predictions: PredictionData | null;
  metadata: Metadata | null;
  segments: SegmentInfo[] | null;
  roiData: ROIData | null;
  loading: boolean;
  error: string | null;
}

async function fetchBinary<T extends Float32Array | Uint32Array | Uint16Array>(
  url: string,
  ArrayType: { new (buffer: ArrayBuffer): T }
): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return new ArrayType(buffer);
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function useBrainData(basePath: string = '/data'): UseBrainDataReturn {
  const [meshData, setMeshData] = useState<BrainMeshData | null>(null);
  const [predictions, setPredictions] = useState<PredictionData | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [segments, setSegments] = useState<SegmentInfo[] | null>(null);
  const [roiData, setRoiData] = useState<ROIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Reset state when basePath changes
    setMeshData(null);
    setPredictions(null);
    setMetadata(null);
    setSegments(null);
    setRoiData(null);
    setLoading(true);
    setError(null);

    async function loadData() {
      try {
        // Fetch all data in parallel
        const [
          vertices,
          faces,
          sulcalDepth,
          predictionsData,
          metadataJson,
          segmentsJson,
          parcellation,
          roiNames,
        ] = await Promise.all([
          fetchBinary(`${basePath}/mesh/vertices.bin`, Float32Array),
          fetchBinary(`${basePath}/mesh/faces.bin`, Uint32Array),
          fetchBinary(`${basePath}/mesh/sulcal_depth.bin`, Float32Array),
          fetchBinary(`${basePath}/predictions/predictions.bin`, Float32Array),
          fetchJSON<Metadata>(`${basePath}/predictions/metadata.json`),
          fetchJSON<SegmentInfo[]>(`${basePath}/stimulus/segments.json`),
          fetchBinary(`${basePath}/mesh/parcellation.bin`, Uint16Array),
          fetchJSON<string[]>(`${basePath}/mesh/roi_names.json`),
        ]);

        if (cancelled) return;

        setMeshData({ vertices, faces, sulcalDepth });
        setPredictions({
          data: predictionsData,
          nTimesteps: metadataJson.nTimesteps,
          nVertices: metadataJson.nVertices,
        });
        setMetadata(metadataJson);
        setSegments(segmentsJson);
        setRoiData({ vertexLabels: parcellation, roiNames });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error loading brain data';
          console.error('Failed to load brain data:', err);
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [basePath]);

  return { meshData, predictions, metadata, segments, roiData, loading, error };
}
