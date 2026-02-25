import { useMemo } from 'react';
import { type Severity } from '@domain/recovery-lens-observability-models';

type RunRow = {
  readonly runId: string;
  readonly at: string;
  readonly severity: Severity;
  readonly name: string;
};

const makeRows = (seed: number): RunRow[] =>
  Array.from({ length: 12 }, (_, index) => ({
    runId: `run:${seed + index}`,
    at: new Date(Date.now() + index * 1000).toISOString(),
    severity: (['critical', 'error', 'warn', 'info', 'trace'][index % 5] as Severity),
    name: `Run-${index}`,
  }));

export const useRecoveryLensRuns = (namespace: string): readonly RunRow[] => {
  return useMemo(() => makeRows(namespace.length), [namespace]);
};
