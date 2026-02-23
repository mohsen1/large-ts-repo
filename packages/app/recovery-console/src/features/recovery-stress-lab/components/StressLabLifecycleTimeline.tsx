import { useMemo } from 'react';
import { OrchestrationPlan, RecoverySimulationResult } from '@domain/recovery-stress-lab';

interface Props {
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly enabled: boolean;
}

const deriveDuration = (simulation: RecoverySimulationResult | null): number => {
  if (!simulation) return 0;
  if (simulation.ticks.length === 0) return 0;
  const start = Date.parse(simulation.startedAt);
  const end = Date.parse(simulation.endedAt);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 1000 / 60)) : 0;
};

const statusBuckets = (plan: OrchestrationPlan | null, simulation: RecoverySimulationResult | null): readonly string[] => {
  const items: string[] = [];
  items.push('initialized');
  if (plan?.schedule.length) items.push('planned');
  if (plan?.dependencies.nodes.length) items.push('dependency-modeled');
  if (simulation) items.push('simulated');
  if (simulation?.ticks.some((tick) => tick.confidence < 0.2)) items.push('low-confidence');
  if ((simulation?.ticks.length ?? 0) > 60) items.push('extended-run');
  return items;
}

export const StressLabLifecycleTimeline = ({ plan, simulation, enabled }: Props) => {
  const duration = useMemo(() => deriveDuration(simulation), [simulation]);
  const buckets = useMemo(() => statusBuckets(plan, simulation), [plan, simulation]);
  const windowCount = simulation?.ticks.length ?? 0;
  const riskTrend = useMemo(() => {
    if (!simulation || simulation.ticks.length === 0) return [] as number[];
    return simulation.ticks.slice(0, 20).map((tick) => Math.round(tick.confidence * 1000) / 10);
  }, [simulation]);

  return (
    <section>
      <h2>Lifecycle Timeline</h2>
      <p>{`Enabled: ${enabled}`}</p>
      <p>{`Duration minutes: ${duration}`}</p>
      <p>{`Risk ticks: ${windowCount}`}</p>
      <ul>
        {buckets.map((bucket) => (
          <li key={bucket}>{bucket}</li>
        ))}
      </ul>
      <p>{`Window states captured: ${windowCount}`}</p>
      <ol>
        {riskTrend.map((value, index) => (
          <li key={`${index}-${value}`}>{`#${index} confidence ${value.toFixed(1)}%`}</li>
        ))}
      </ol>
    </section>
  );
};
