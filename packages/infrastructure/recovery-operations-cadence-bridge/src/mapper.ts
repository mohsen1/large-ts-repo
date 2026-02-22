import type { CadenceRunPlan, CadenceMetrics, CadenceExecutionWindow } from '@domain/recovery-operations-cadence';
import { calculateWindowCoverage, calculateConcurrencyPeak, estimateAverageDuration, splitWindows } from '@domain/recovery-operations-cadence';
import { createEnvelope, type Envelope } from '@shared/protocol';
import { ok, fail, type Result } from '@shared/result';
import { type RecoverySignal } from '@domain/recovery-operations-models';

export interface CadenceBridgeEnvelope extends Envelope<{
  readonly version: number;
  readonly runPlan: CadenceRunPlan;
  readonly metrics?: CadenceMetrics;
  readonly events?: readonly CadenceExecutionWindow[];
  readonly notes?: readonly string[];
}> {}

export interface CadenceTelemetryRow {
  readonly planId: string;
  readonly tenant: string;
  readonly readinessScore: number;
  readonly coveredSlots: number;
  readonly maxConcurrent: number;
  readonly notes: readonly string[];
}

const calculateMetrics = (plan: CadenceRunPlan): CadenceMetrics => {
  const coverage = calculateWindowCoverage({ windows: plan.windows, slots: plan.slots });
  const averageDuration = estimateAverageDuration(plan.slots);
  return {
    slotCoverage: coverage,
    averageSlotDuration: averageDuration,
    concurrencyPeak: calculateConcurrencyPeak(plan.slots),
    windowCoverage: calculateWindowCoverage({ windows: plan.windows, slots: plan.slots }),
  };
};

export const createCadenceBridgeEnvelope = (plan: CadenceRunPlan): CadenceBridgeEnvelope => {
  const metrics = calculateMetrics(plan);
  const events = splitWindows(plan);

  return createEnvelope('recovery.operations.cadence.plan', {
    version: 1,
    runPlan: plan,
    metrics,
    events,
    notes: [
      `tenant:${plan.profile.tenant}`,
      `priority:${plan.profile.priority}`,
      `slots:${plan.slots.length}`,
      `windows:${plan.windows.length}`,
    ],
  }) as unknown as CadenceBridgeEnvelope;
};

export const toTelemetryRows = (plan: CadenceRunPlan, signals: readonly RecoverySignal[]): CadenceTelemetryRow[] => {
  return plan.windows.map((window) => ({
    planId: String(plan.id),
    tenant: String(plan.profile.tenant),
    readinessScore: plan.readinessScore,
    coveredSlots: plan.slots.filter((slot) => slot.windowId === window.id).length,
    maxConcurrent: plan.profile.windows.length > 0 ? plan.profile.windows[0]?.maxParallelism ?? 1 : 1,
    notes: [...plan.policySummary.warnings, ...plan.policySummary.blockedByRules, ...signals.map((signal) => signal.id)],
  }));
};

export const mapSignalsToEvents = (signals: readonly RecoverySignal[]): Result<string[], string> => {
  if (signals.length === 0) {
    return fail<string>('NO_SIGNALS', 'No recovery signals supplied for mapping');
  }

  const lines = signals.map((signal, index) => `${index}-${signal.id}-${signal.source}`);
  return ok(lines);
};
