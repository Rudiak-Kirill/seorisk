'use client';

import { useEffect, useState } from 'react';

type ProgressPhase = 'single' | 'initial' | 'deep';

type ToolProgressProps = {
  active: boolean;
  phase?: ProgressPhase;
  title: string;
  description: string;
};

const PHASE_CONFIG: Record<
  ProgressPhase,
  { start: number; limit: number; step: number; intervalMs: number }
> = {
  single: { start: 12, limit: 88, step: 5, intervalMs: 280 },
  initial: { start: 8, limit: 35, step: 6, intervalMs: 320 },
  deep: { start: 38, limit: 92, step: 3, intervalMs: 350 },
};

export default function ToolProgress({
  active,
  phase = 'single',
  title,
  description,
}: ToolProgressProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }

    const config = PHASE_CONFIG[phase];
    setProgress((current) => (current > 0 ? current : config.start));

    const intervalId = window.setInterval(() => {
      setProgress((current) =>
        current >= config.limit ? current : Math.min(config.limit, current + config.step)
      );
    }, config.intervalMs);

    return () => window.clearInterval(intervalId);
  }, [active, phase]);

  if (!active) {
    return null;
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
      <div className="flex items-center justify-between gap-4 text-sm font-medium text-gray-900">
        <span>{title}</span>
        <span>{progress}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-orange-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-3 text-sm text-gray-700">{description}</div>
    </div>
  );
}
