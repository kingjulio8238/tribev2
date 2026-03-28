import { useState, useEffect, useMemo } from 'react';
import type { EmotionData } from '../types/index.ts';

export interface EmotionScore {
  name: string;
  intensity: number; // 0 to 1
}

const EMOTION_NAMES = [
  'Engagement',
  'Tension',
  'Wonder',
  'Empathy',
  'Excitement',
  'Unease',
];

const EMPTY_RESULT: EmotionScore[] = EMOTION_NAMES.map((name) => ({
  name,
  intensity: 0,
}));

export function useEmotionData(
  basePath: string = '/data',
): EmotionData | null {
  const [data, setData] = useState<EmotionData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const resp = await fetch(`${basePath}/emotions.json`);
        if (!resp.ok) return;
        const json = (await resp.json()) as EmotionData;
        if (!cancelled) setData(json);
      } catch {
        // emotions.json is optional — silently ignore
      }
    }

    load();
    return () => { cancelled = true; };
  }, [basePath]);

  return data;
}

export function useEmotionScores(
  emotionData: EmotionData | null,
  currentTime: number,
  trSeconds: number,
): EmotionScore[] {
  const timestepIndex = useMemo(() => {
    if (!emotionData || emotionData.length === 0) return 0;
    const rawIndex = trSeconds > 0 ? Math.floor(currentTime / trSeconds) : 0;
    return Math.min(Math.max(rawIndex, 0), emotionData.length - 1);
  }, [currentTime, trSeconds, emotionData]);

  return useMemo(() => {
    if (!emotionData || emotionData.length === 0) return EMPTY_RESULT;

    const step = emotionData[timestepIndex];
    if (!step || !step.emotions) return EMPTY_RESULT;

    return EMOTION_NAMES.map((name) => ({
      name,
      intensity: step.emotions[name] ?? 0,
    }));
  }, [emotionData, timestepIndex]);
}
