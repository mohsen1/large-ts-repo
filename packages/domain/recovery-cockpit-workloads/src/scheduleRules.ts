import { RecoveryPlan, RecoveryAction } from '@domain/recovery-cockpit-models';
import { buildTopologySnapshot } from './topology';

export type ScheduleSlot = {
  readonly region: string;
  readonly capacity: number;
  readonly runningActions: number;
  readonly queuedActions: number;
  readonly nextAvailableAt: string;
};

export type ExecutionWindow = {
  readonly at: string;
  readonly actionId: string;
  readonly actionCommand: string;
  readonly concurrency: number;
  readonly predictedFinish: string;
};

export type ReadinessGate = {
  readonly condition: string;
  readonly accepted: boolean;
  readonly detail: string;
};

const compareActionRisk = (left: RecoveryAction, right: RecoveryAction): number => {
  if (left.expectedDurationMinutes !== right.expectedDurationMinutes) {
    return left.expectedDurationMinutes - right.expectedDurationMinutes;
  }
  if (left.tags.length !== right.tags.length) {
    return left.tags.length - right.tags.length;
  }
  return left.dependencies.length - right.dependencies.length;
};

export const orderBySlotSafety = (plan: RecoveryPlan): readonly RecoveryAction[] =>
  [...plan.actions].sort((left, right) => compareActionRisk(left, right));

export const groupByRegionWindows = (plan: RecoveryPlan): Readonly<Record<string, readonly RecoveryAction[]>> => {
  const groups = new Map<string, RecoveryAction[]>();
  for (const action of plan.actions) {
    const existing = groups.get(action.region) ?? [];
    existing.push(action);
    groups.set(action.region, existing);
  }
  return Object.fromEntries(groups.entries()) as Record<string, readonly RecoveryAction[]>;
};

export const estimateExecutionWindows = (plan: RecoveryPlan, start = Date.now(), maxParallelism = 2): ReadonlyArray<ExecutionWindow> => {
  const ordered = orderBySlotSafety(plan);
  const queueByRegion = new Map<string, { clock: number; running: number }>();
  const windows: ExecutionWindow[] = [];

  for (const action of ordered) {
    const slot = queueByRegion.get(action.region) ?? { clock: start, running: 0 };
    const slotStart = slot.clock;
    const durationMs = action.expectedDurationMinutes * 60_000;
    const predictedFinish = slotStart + durationMs;

    if (slot.running >= maxParallelism) {
      slot.clock = predictedFinish;
      slot.running = Math.max(0, slot.running - 1);
    } else {
      slot.running += 1;
    }

    windows.push({
      at: new Date(slotStart).toISOString(),
      actionId: action.id,
      actionCommand: action.command,
      concurrency: slot.running,
      predictedFinish: new Date(predictedFinish).toISOString(),
    });

    queueByRegion.set(action.region, slot);
  }

  return windows;
};

export const computeSlots = (plan: RecoveryPlan, parallelism = 2): ReadonlyArray<ScheduleSlot> => {
  const grouped = groupByRegionWindows(plan);
  return Object.entries(grouped).map(([region, actions]) => {
    const regionWindows = estimateExecutionWindows(
      {
        ...plan,
        actions,
      },
      Date.now(),
      parallelism,
    );

    return {
      region,
      capacity: Math.max(1, Math.ceil(actions.length / Math.max(1, parallelism))),
      runningActions: actions.length,
      queuedActions: regionWindows.filter((window) => Number(new Date(window.predictedFinish)) > Date.now()).length,
      nextAvailableAt: regionWindows.at(-1)?.predictedFinish ?? new Date().toISOString(),
    };
  });
};

export const isReadyByGate = (plan: RecoveryPlan): ReadonlyArray<ReadinessGate> => {
  const topology = buildTopologySnapshot(plan);
  const slots = computeSlots(plan, 2);
  const gates: ReadinessGate[] = [];

  gates.push({
    condition: 'dependency-closure',
    accepted: topology.edges.every((edge) => topology.nodesById.has(edge.to) && topology.nodesById.has(edge.from)),
    detail: `edges=${topology.edges.length}`,
  });

  const actionRateOk = plan.actions.every((action) => action.expectedDurationMinutes <= 120);
  gates.push({
    condition: 'max-action-duration',
    accepted: actionRateOk,
    detail: `max=${Math.max(...plan.actions.map((action) => action.expectedDurationMinutes))}`,
  });

  const hasCapacity = slots.every((slot) => slot.capacity >= 1 && slot.runningActions <= 500);
  gates.push({
    condition: 'capacity-available',
    accepted: hasCapacity,
    detail: `regions=${slots.length}`,
  });

  const criticalDependencies = plan.actions.filter((action) => topology.nodesById.get(action.id)?.criticality === 'critical').length;
  gates.push({
    condition: 'critical-dependency-count',
    accepted: criticalDependencies <= 5,
    detail: `criticalDependencies=${criticalDependencies}`,
  });

  return gates;
};

export const rankTopology = (topology: ReturnType<typeof buildTopologySnapshot>): ReadonlyArray<{ namespace: string; score: number }> => {
  const regions = new Map<string, number>();
  for (const action of topology.nodesById.values()) {
    const regionScore = regions.get(action.region) ?? 0;
    regions.set(action.region, regionScore + (action.criticality === 'critical' ? 9 : action.criticality === 'high' ? 6 : 3));
  }
  return Array.from(regions.entries())
    .map(([namespace, score]) => ({ namespace, score }))
    .sort((left, right) => right.score - left.score);
};
