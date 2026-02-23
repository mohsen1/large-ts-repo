import { RecoveryPlan, RecoveryAction, UtcIsoTimestamp, toTimestamp } from '@domain/recovery-cockpit-models';

export type SlI = 'readiness' | 'latency' | 'error-rate' | 'availability';

export type SliTarget = {
  readonly sli: SlI;
  readonly target: number;
  readonly tolerance: number;
};

export type SliSlot = {
  readonly planId: string;
  readonly at: UtcIsoTimestamp;
  readonly actionId: string;
  readonly serviceCode: string;
  readonly target: SliTarget;
  readonly pressure: number;
  readonly predicted: number;
};

export type SliSchedule = {
  readonly planId: string;
  readonly generatedAt: UtcIsoTimestamp;
  readonly slots: readonly SliSlot[];
  readonly summary: {
    readonly totalPressure: number;
    readonly maxPredicted: number;
    readonly risk: 'low' | 'medium' | 'high';
  };
};

const defaultTargets: ReadonlyArray<SliTarget> = [
  { sli: 'readiness', target: 95, tolerance: 5 },
  { sli: 'latency', target: 250, tolerance: 35 },
  { sli: 'error-rate', target: 0.5, tolerance: 0.3 },
  { sli: 'availability', target: 99.5, tolerance: 0.5 },
];

const pressureForAction = (action: RecoveryAction, index: number): number => {
  const duration = action.expectedDurationMinutes;
  const dependency = action.dependencies.length * 3;
  const base = Math.min(100, duration + dependency + index * 1.5);
  return Math.max(1, base);
};

const predict = (action: RecoveryAction, target: SliTarget, pressure: number): number => {
  const tagModifier = action.tags.includes('critical') ? 1.6 : 1.0;
  const commandModifier = action.command.includes('drain') ? 1.3 : 1.0;
  const base = target.target - pressure * 0.18;
  const predicted = base * tagModifier * commandModifier;

  if (target.sli === 'latency' || target.sli === 'error-rate') {
    return Number((predicted + pressure * 0.3).toFixed(2));
  }
  return Number((Math.max(0, predicted - pressure * 0.12)).toFixed(2));
};

const zone = (value: number, target: SliTarget): 'low' | 'medium' | 'high' => {
  const gap = Math.abs(value - target.target);
  if (gap <= target.tolerance) return 'low';
  if (gap <= target.tolerance * 2) return 'medium';
  return 'high';
};

export const buildSlISchedule = (plan: RecoveryPlan): SliSchedule => {
  const actions = [...plan.actions].sort((left, right) => left.expectedDurationMinutes - right.expectedDurationMinutes);
  const slots: SliSlot[] = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]!;
    const pressure = pressureForAction(action, index);
    for (const target of defaultTargets) {
      const predicted = predict(action, target, pressure);
      slots.push({
        planId: plan.planId,
        at: toTimestamp(new Date(Date.now() + index * 6 * 60 * 1000)),
        actionId: action.id,
        serviceCode: action.serviceCode,
        target,
        pressure,
        predicted,
      });
    }
  }

  const maxPredicted = slots.reduce((acc, slot) => Math.max(acc, slot.predicted), 0);
  const totalPressure = slots.reduce((acc, slot) => acc + slot.pressure, 0);
  const summary = {
    totalPressure: Number(totalPressure.toFixed(2)),
    maxPredicted: Number(maxPredicted.toFixed(2)),
    risk: zone(maxPredicted, { sli: 'availability', target: 99.5, tolerance: 0.5 }),
  };

  return {
    planId: plan.planId,
    generatedAt: toTimestamp(new Date()),
    slots,
    summary,
  };
};

export const summarizeSlISchedule = (schedule: SliSchedule): string => {
  const high = schedule.slots.filter((slot) => zone(slot.predicted, slot.target) === 'high').length;
  const medium = schedule.slots.filter((slot) => zone(slot.predicted, slot.target) === 'medium').length;
  return `${schedule.planId} pressure=${schedule.summary.totalPressure} max=${schedule.summary.maxPredicted} high=${high} medium=${medium}`;
};

export const filterByService = (schedule: SliSchedule, serviceCode: string): readonly SliSlot[] =>
  schedule.slots.filter((slot) => slot.serviceCode === serviceCode);

export const aggregateBySli = (schedule: SliSchedule): ReadonlyMap<SlI, readonly SliSlot[]> => {
  const grouped = new Map<SlI, SliSlot[]>();
  for (const slot of schedule.slots) {
    const existing = grouped.get(slot.target.sli) ?? [];
    grouped.set(slot.target.sli, [...existing, slot]);
  }
  return grouped;
};

export const pickTopRiskSlots = (schedule: SliSchedule, count = 5): readonly SliSlot[] =>
  [...schedule.slots]
    .sort((left, right) => {
      if (left.target.sli === right.target.sli) {
        return right.predicted - left.predicted;
      }
      return right.pressure - left.pressure;
    })
    .slice(0, count);

export const estimateCapacityDelta = (schedule: SliSchedule): number => {
  if (schedule.slots.length === 0) return 0;
  const highRisk = schedule.slots.filter((slot) => zone(slot.predicted, slot.target) === 'high').length;
  return Number(((highRisk / schedule.slots.length) * 100).toFixed(2));
};
