import type { FabricRun, FabricPlan } from '@domain/recovery-fabric-orchestration';
import { buildRunMetrics } from '@service/recovery-fabric-controller';

export interface FabricReadinessTimelineProps {
  readonly runs: readonly FabricRun[];
  readonly plan: FabricPlan | null;
}

export const FabricReadinessTimeline = ({ runs, plan }: FabricReadinessTimelineProps) => {
  const rows = runs
    .map((run) => {
      const metrics = buildRunMetrics(run);
      return {
        id: run.id,
        metrics,
        commandCount: run.commandIds.length,
        planCommandCount: plan?.commands.length ?? 0,
      };
    })
    .sort((left, right) => right.metrics.timelineMinutes - left.metrics.timelineMinutes);

  return (
    <section className="fabric-readiness-timeline">
      <h3>Run Timeline</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <div>{row.id}</div>
            <div>{row.metrics.status}</div>
            <div>readiness {row.metrics.readiness}</div>
            <div>risk {row.metrics.risk}</div>
            <div>
              commands {row.commandCount}/{row.planCommandCount}
            </div>
            <div>minutes {Math.round(row.metrics.timelineMinutes)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
};
