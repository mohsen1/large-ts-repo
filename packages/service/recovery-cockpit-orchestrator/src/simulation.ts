import { RecoveryPlan, computeReadiness, CommandEvent, RecoveryAction } from '@domain/recovery-cockpit-models';
import { buildReadinessProjection } from '@domain/recovery-cockpit-intelligence';

export type SimulationStep = {
  actionId: string;
  expectedDurationMinutes: number;
  status: CommandEvent['status'];
};

export type SimulationReport = {
  planId: string;
  estimatedMinutes: number;
  readinessAfterRun: number;
  steps: readonly SimulationStep[];
  criticalWarnings: ReadonlyArray<string>;
};

export const simulatePlan = (plan: RecoveryPlan): SimulationReport => {
  const projections = buildReadinessProjection(plan, plan.mode === 'manual' ? 'manual' : plan.mode === 'automated' ? 'automated' : 'semi');

  let minutes = 0;
  const warnings: string[] = [];
  const steps: SimulationStep[] = [];

  for (const action of plan.actions) {
    const expected = action.expectedDurationMinutes;
    const delta = computeReadiness(100, minutes + expected);
    if (expected > plan.slaMinutes) {
      warnings.push(`action ${action.id} exceeds sla by ${expected - plan.slaMinutes}m`);
    }
    minutes += expected;
    steps.push({
      actionId: action.id,
      expectedDurationMinutes: expected,
      status: expected > plan.slaMinutes ? 'failed' : 'queued',
    });
  }

  const readinessAfterRun = projections.length > 0 ? projections[projections.length - 1].value : 100;
  return {
    planId: plan.planId,
    estimatedMinutes: minutes,
    readinessAfterRun: Number(readinessAfterRun.toFixed(2)),
    steps,
    criticalWarnings: warnings,
  };
};

export const estimateActionOrder = (actions: readonly RecoveryAction[]): ReadonlyArray<string> =>
  actions
    .slice()
    .sort((left, right) => left.expectedDurationMinutes - right.expectedDurationMinutes)
    .map((action) => action.id);
