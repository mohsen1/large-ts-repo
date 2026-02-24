import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { RecoveryPlan, PlanId } from '@domain/recovery-cockpit-models';
import { PlanProjection } from '@data/recovery-cockpit-store';
import { Result, fail, ok } from '@shared/result';
import { groupBy, percentile, movingAverage } from '@shared/util';
import { projectPlan } from '@data/recovery-cockpit-store';

export type ReadinessWorkloadLane = Readonly<{
  readonly lane: string;
  readonly planId: PlanId;
  readonly planCount: number;
  readonly meanReadiness: number;
  readonly trend: 'up' | 'flat' | 'down';
}>;

const classifyTrend = (values: readonly number[]): 'up' | 'flat' | 'down' => {
  if (values.length < 2) return 'flat';
  const avg = movingAverage(values, 3);
  const last = avg.at(-1) ?? 0;
  const prev = avg.at(-2) ?? last;
  if (last > prev) return 'up';
  if (last < prev) return 'down';
  return 'flat';
};

export const workloadByReadiness = async (
  store: InMemoryCockpitStore,
  plans: readonly RecoveryPlan[],
): Promise<Result<ReadonlyArray<ReadinessWorkloadLane>, string>> => {
  const projections: PlanProjection[] = [];
  for (const plan of plans) {
    const projection = await projectPlan(store, plan.planId);
    if (!projection.ok) {
      return fail(projection.error);
    }
    projections.push(projection.value);
  }

  const grouped = groupBy(projections, (entry) => {
    if (entry.readinessBaseline >= 75) return 'green';
    if (entry.readinessBaseline >= 55) return 'amber';
    return 'red';
  });

  const lanes = grouped.map((group) => {
    const values = group.values.map((entry) => entry.readinessBaseline);
    const meanReadiness = percentile(values, 0.5);
    const trendSeries = [...group.values].map((entry) => entry.readinessBaseline);
    const trend = classifyTrend(trendSeries);
    return {
      lane: group.key,
      planId: group.values[0]!.planId,
      planCount: group.values.length,
      meanReadiness,
      trend,
    };
  });

  return ok(lanes);
};

export const workloadSignature = (lanes: readonly ReadinessWorkloadLane[]): string => {
  return lanes.map((lane) => `${lane.lane}:${lane.planCount}:${lane.trend}`).join('|');
};
