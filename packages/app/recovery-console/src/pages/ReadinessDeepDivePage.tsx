import { useMemo, useState } from 'react';
import { useReadinessDeepDiveState, type UseReadinessDeepDiveStateParams } from '../hooks/useReadinessDeepDiveState';
import { ReadinessCommandReadinessTimeline } from '../components/ReadinessCommandReadinessTimeline';
import { ReadinessGovernancePanel } from '../components/ReadinessGovernancePanel';
import { ReadinessReadinessWorkloadTable } from '../components/ReadinessReadinessWorkloadTable';
import { ReadinessPolicy, type ReadinessRunId } from '@domain/recovery-readiness';
import type { ReadinessReadModel } from '@data/recovery-readiness-store';

interface ReadinessDeepDivePageProps extends Omit<UseReadinessDeepDiveStateParams, 'policy'> {
  readonly planPolicy: ReadinessPolicy;
}

export const ReadinessDeepDivePage = ({ tenant, planPolicy }: ReadinessDeepDivePageProps) => {
  const [selectedRunId, setSelectedRunId] = useState<ReadinessRunId | undefined>(undefined);
  const {
    loading,
    summary,
    rows,
    topRuns,
    runs,
    runIds,
    refresh,
  } = useReadinessDeepDiveState({ tenant, policy: planPolicy, refreshIntervalMs: 12000 });

  const filtered = useMemo<readonly ReadinessReadModel[]>(
    () => runs.filter((run) => run.plan.metadata.owner === tenant || rows.some((entry) => entry.runId === run.plan.runId)),
    [runs, rows, tenant],
  );

  const digest = useMemo(
    () => ({
      totalRuns: summary.total,
      criticalRuns: summary.criticalRuns,
      meanTrend: 'stable' as const,
      topSignals: rows.slice(0, 10).map((entry) => ({ runId: entry.runId, count: Math.round(entry.healthScore) })),
    }),
    [summary, rows],
  );

  return (
    <main>
      <h1>Readiness Deep Dive</h1>
      <button onClick={refresh} type="button">
        Refresh
      </button>
      {loading ? <p>loading…</p> : null}
      <section>
        <p>{`avg health: ${summary.averageHealth}`}</p>
        <p>{`critical runs: ${summary.criticalRuns}`}</p>
        <p>{`observed runs: ${summary.total}`}</p>
      </section>

      <ReadinessGovernancePanel
        tenant={tenant}
        runIds={runIds}
        totalRuns={summary.total}
        digest={digest}
      />

      <ReadinessReadinessWorkloadTable
        rows={filtered}
        selectedRunId={selectedRunId}
        onRowSelect={setSelectedRunId}
      />

      <ReadinessCommandReadinessTimeline
        tenant={tenant}
        runs={filtered}
        selectedRunId={selectedRunId}
      />

      <section>
        <h2>Top Runs</h2>
        <ul>
          {topRuns.map((runId) => (
            <li key={runId}>{runId}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Portfolio</h2>
        <p>{`rows=${rows.length}`}</p>
        <ul>
          {rows.slice(0, 10).map((item) => (
            <li key={item.runId}>{`${item.runId} -> ${item.owner}`}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
