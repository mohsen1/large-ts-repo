import { useMemo } from 'react';
import type { EngineTick, EngineResult } from '@service/recovery-orchestration-studio-engine';

interface RunbookWorkloadPanelProps {
  readonly result?: EngineResult;
  readonly ticks: readonly EngineTick[];
}

const phaseBucket = (ticks: readonly EngineTick[]) => {
  const buckets = new Map<string, number>();
  for (const tick of ticks) {
    const current = buckets.get(tick.phase) ?? 0;
    buckets.set(tick.phase, current + 1);
  }
  return buckets;
};

export const RunbookWorkloadPanel = ({ result, ticks }: RunbookWorkloadPanelProps) => {
  const buckets = useMemo(() => phaseBucket(ticks), [ticks]);
  const elapsedMs = useMemo(() => {
    if (!result) {
      return 0;
    }
    const start = new Date(result.startedAt).getTime();
    const end = new Date(result.finishedAt).getTime();
    return Number.isFinite(end) && Number.isFinite(start) ? end - start : 0;
  }, [result]);

  return (
    <section>
      <h2>Runbook Workload</h2>
      <p>{`elapsed=${elapsedMs}ms`}</p>
      <p>{`ticks=${ticks.length}`}</p>
      <ul>
        {[...buckets.entries()].map(([phase, count]) => (
          <li key={phase}>
            {phase}: {count}
          </li>
        ))}
      </ul>
    </section>
  );
};
