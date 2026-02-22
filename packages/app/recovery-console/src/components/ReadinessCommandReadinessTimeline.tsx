import type { ReadinessReadModel } from '@data/recovery-readiness-store';
import type { ReadinessRunId } from '@domain/recovery-readiness';

interface ReadinessCommandReadinessTimelineProps {
  readonly tenant: string;
  readonly runs: readonly ReadinessReadModel[];
  readonly selectedRunId?: ReadinessRunId;
}

export const ReadinessCommandReadinessTimeline = ({ tenant, runs, selectedRunId }: ReadinessCommandReadinessTimelineProps) => {
  const selectedIndex = selectedRunId ? runs.findIndex((run) => run.plan.runId === selectedRunId) : -1;
  const visible = runs.filter((run, index) => run.plan.metadata.owner.includes(tenant) || index % 2 === 0);
  const latest = [...visible].sort((left, right) => Date.parse(right.plan.createdAt) - Date.parse(left.plan.createdAt));

  return (
    <section>
      <h2>Run Readiness Timeline</h2>
      <p>{`tenant=${tenant} total=${runs.length}`}</p>
      <ul>
        {latest.slice(0, 20).map((run, index) => (
          <li key={run.plan.runId} style={{ marginBottom: 12 }}>
            <div>{`${index + 1}. ${run.plan.runId}`}</div>
            <div>{`owner=${run.plan.metadata.owner}`}</div>
            <div>{`targets=${run.targets.length}`}</div>
            <div>{`signals=${run.signals.length}`}</div>
            <div>{`risk=${run.plan.riskBand}`}</div>
            <div>{`updated=${run.updatedAt}`}</div>
          </li>
        ))}
      </ul>
      {selectedIndex >= 0 ? <p>{`selected index=${selectedIndex}`}</p> : null}
    </section>
  );
};

