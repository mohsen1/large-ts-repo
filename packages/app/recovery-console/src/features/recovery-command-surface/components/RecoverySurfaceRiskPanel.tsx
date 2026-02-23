import { useMemo } from 'react';

import type { SurfaceRun } from '@domain/recovery-command-surface-models';

interface RecoverySurfaceRiskPanelProps {
  readonly runs: readonly SurfaceRun[];
}

interface RiskBucket {
  readonly label: string;
  readonly count: number;
}

const severity = (value: number): string => (value >= 70 ? 'high' : value >= 40 ? 'medium' : 'low');

const bucketByTenant = (runs: readonly SurfaceRun[]): readonly RiskBucket[] => {
  const table = new Map<string, number>();
  for (const run of runs) {
    const key = `${severity(run.riskScore)}-${run.tenant}`;
    table.set(key, (table.get(key) ?? 0) + 1);
  }
  return [...table.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
};

export const RecoverySurfaceRiskPanel = ({ runs }: RecoverySurfaceRiskPanelProps) => {
  const buckets = useMemo(() => bucketByTenant(runs), [runs]);
  const riskTotal = useMemo(
    () => runs.reduce((sum, run) => sum + run.riskScore, 0),
    [runs],
  );

  return (
    <section>
      <h3>Risk Surface Board</h3>
      <p>Aggregate risk: {riskTotal}</p>
      <ul>
        {buckets.map((bucket) => (
          <li key={bucket.label}>
            {bucket.label}: {bucket.count}
          </li>
        ))}
      </ul>
    </section>
  );
};
