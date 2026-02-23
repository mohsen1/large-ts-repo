import { summarizeStoreHealth } from '@data/recovery-ops-orchestration-lab-store';
import type { LabStoreSnapshot, OrchestrationLabRecord, LabRunRecord, StoreSummary } from '@data/recovery-ops-orchestration-lab-store';

interface RunHealthPanelProps {
  readonly snapshot: LabStoreSnapshot;
  readonly runs: readonly LabRunRecord[];
  readonly summary: StoreSummary;
}

export const RunHealthPanel = ({ snapshot, runs, summary }: RunHealthPanelProps) => {
  const records: readonly OrchestrationLabRecord[] = snapshot.labs.map((lab) => ({
    envelope: {
      id: `${lab.id}:health` as OrchestrationLabRecord['envelope']['id'],
      state: 'draft',
      lab,
      intent: {
        tenantId: lab.tenantId,
        siteId: 'default',
        urgency: lab.signals.some((signal) => signal.tier === 'critical') ? 'critical' : 'normal',
        rationale: 'run-health',
        owner: lab.tenantId,
        requestedAt: new Date().toISOString(),
        tags: ['health', 'dashboard'],
      },
      plans: lab.plans,
      windows: lab.windows,
      metadata: {},
      revision: 0,
    },
  }));
  const metrics = summarizeStoreHealth(records, runs, summary);

  return (
    <section>
      <h3>Run health</h3>
      <p>{`envelopes=${snapshot.labs.length} runs=${snapshot.runs.length}`}</p>
      <p>{`healthy-labs ${Math.round(metrics.summary.healthyLabRatio * 100)}%`}</p>
      <p>{`run-failure ${Math.round(metrics.summary.runFailureRatio * 100)}%`}</p>
      <p>{`run-paused ${Math.round(metrics.summary.runPauseRatio * 100)}%`}</p>
      <ul>
        {metrics.labHealth.map((entry) => (
          <li key={entry.labId}>
            {`${entry.labId}: signals=${entry.signalCount} plans=${entry.planCount} runs=${entry.runCount}`}
          </li>
        ))}
      </ul>
    </section>
  );
};
