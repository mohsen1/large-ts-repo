import { useMemo } from 'react';

export interface FabricCheckSummaryProps {
  runChecks: ReadonlyArray<{ facility: string; total: number }>;
  checksum: string | null;
}

export const FabricCheckSummary = ({ runChecks, checksum }: FabricCheckSummaryProps) => {
  const total = useMemo(() => runChecks.reduce((acc, check) => acc + check.total, 0), [runChecks]);
  const maxFacility = useMemo(() => {
    let top = runChecks[0] ?? null;
    for (const check of runChecks) {
      if (!top || check.total > top.total) {
        top = check;
      }
    }
    return top;
  }, [runChecks]);

  return (
    <section>
      <h3>Run checks</h3>
      <div>checksum {checksum ?? 'pending'}</div>
      <div>checks {runChecks.length}</div>
      <div>total-score {total}</div>
      <div>top facility {maxFacility?.facility ?? 'none'} ({maxFacility?.total ?? 0})</div>
      <ul>
        {runChecks.map((check) => (
          <li key={check.facility}>
            {check.facility} · {check.total}
          </li>
        ))}
      </ul>
    </section>
  );
};
