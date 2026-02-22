import type { ReadinessRunId } from '@domain/recovery-readiness';

type ReadinessRunlineDigest = {
  totalRuns: number;
  criticalRuns: number;
  meanTrend: 'stable' | 'ramping' | 'degraded';
  topSignals: readonly { runId: ReadinessRunId; count: number }[];
};

interface ReadinessGovernancePanelProps {
  readonly tenant: string;
  readonly runIds: readonly ReadinessRunId[];
  readonly totalRuns: number;
  readonly digest: Readonly<ReadinessRunlineDigest>;
}

export const ReadinessGovernancePanel = ({ tenant, runIds, totalRuns, digest }: ReadinessGovernancePanelProps) => {
  const riskRuns = runIds.filter((runId) => runId.includes('risk'));
  const atRisk = digest.topSignals.length;

  return (
    <section>
      <h2>Governance</h2>
      <p>{`tenant: ${tenant}`}</p>
      <div>
        <strong>Total Runs:</strong> {totalRuns}
      </div>
      <div>
        <strong>At Risk:</strong> {atRisk}
      </div>
      <div>
        <strong>Mean Trend:</strong> {digest.meanTrend}
      </div>
      <div>
        <strong>Critical Runs:</strong> {digest.criticalRuns}
      </div>
      <h3>Run Ids</h3>
      <ul>
        {runIds.slice(0, 12).map((runId) => {
          const isRisk = riskRuns.includes(runId);
          return (
            <li key={runId} style={{ color: isRisk ? 'red' : 'inherit' }}>
              {runId}
            </li>
          );
        })}
      </ul>
      <h3>Top Signals</h3>
      <ul>
        {digest.topSignals.slice(0, 20).map((entry) => (
          <li key={entry.runId}>{`${entry.runId}: ${entry.count}`}</li>
        ))}
      </ul>
    </section>
  );
};
