import { useMemo } from 'react';
import type { CommandOrchestrationResult } from '@domain/recovery-ops-orchestration-surface';

interface RecoveryOpsSurfaceRiskTableProps {
  readonly result: CommandOrchestrationResult;
}

export const RecoveryOpsSurfaceRiskTable = ({ result }: RecoveryOpsSurfaceRiskTableProps) => {
  const sorted = useMemo(
    () => [...result.blockers].sort((a, b) => a.localeCompare(b)),
    [result.blockers],
  );

  const status = useMemo(() => (result.ok ? 'PASS' : 'WARN'), [result.ok]);

  return (
    <section>
      <h4>Risk and Gate Status</h4>
      <p>
        Score <strong>{result.score}</strong> | Risk <strong>{result.riskScore}</strong> | {status}
      </p>
      <ul>
        {sorted.length === 0 ? <li>No blockers</li> : sorted.map((entry) => <li key={entry}>{entry}</li>)}
      </ul>
    </section>
  );
};
