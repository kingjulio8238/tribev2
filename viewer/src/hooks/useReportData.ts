import { useState, useEffect } from 'react';
import type { ReportData } from '../types/index.ts';

export function useReportData(basePath: string = '/data'): ReportData | null {
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const resp = await fetch(`${basePath}/report.json`);
        if (!resp.ok) return;
        const json = (await resp.json()) as ReportData;
        if (!cancelled) setData(json);
      } catch {
        // report.json is optional
      }
    }

    load();
    return () => { cancelled = true; };
  }, [basePath]);

  return data;
}
