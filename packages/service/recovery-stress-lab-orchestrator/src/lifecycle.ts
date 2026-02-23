import { OrchestrationPlan, RecoverySimulationResult, StressRunState, TenantId, RecoverySignal, CommandRunbook } from '@domain/recovery-stress-lab';

export type LifecycleStatus = 'idle' | 'validated' | 'planned' | 'simulated' | 'audited' | 'executing' | 'finalized';

export interface LifecycleStep {
  readonly status: LifecycleStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly note: string;
}

export interface LifecycleContext {
  readonly tenantId: TenantId;
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly signals: readonly RecoverySignal[];
  readonly runbooks: readonly CommandRunbook[];
  readonly selectedBand: StressRunState['selectedBand'];
}

export interface LifecycleTrace {
  readonly tenantId: TenantId;
  readonly steps: readonly LifecycleStep[];
  readonly active: LifecycleStatus;
}

export const createInitialLifecycle = (tenantId: TenantId): LifecycleTrace => {
  return {
    tenantId,
    active: 'idle',
    steps: [
      {
        status: 'idle',
        startedAt: new Date().toISOString(),
        note: 'Lifecycle initialized',
      },
    ],
  };
};

export const stepStatusFromState = (state: StressRunState): LifecycleStatus => {
  if (state.plan && state.simulation) return 'simulated';
  if (state.plan) return 'planned';
  if (state.selectedSignals.length > 0) return 'validated';
  return 'idle';
};

const nextStep = (status: LifecycleStatus): LifecycleStatus => {
  if (status === 'idle') return 'validated';
  if (status === 'validated') return 'planned';
  if (status === 'planned') return 'simulated';
  if (status === 'simulated') return 'audited';
  if (status === 'audited') return 'executing';
  if (status === 'executing') return 'finalized';
  return 'finalized';
};

export const advanceLifecycle = (trace: LifecycleTrace, status: LifecycleStatus, note: string): LifecycleTrace => {
  const step: LifecycleStep = {
    status,
    startedAt: new Date().toISOString(),
    note,
  };
  return {
    tenantId: trace.tenantId,
    active: status,
    steps: [...trace.steps, step],
  };
};

export const transitionLifecycle = (trace: LifecycleTrace, context: LifecycleContext): LifecycleTrace => {
  const current = trace.active;
  const desired = stepStatusFromState({
    tenantId: context.tenantId,
    selectedBand: context.selectedBand,
    selectedSignals: context.signals,
    plan: context.plan,
    simulation: context.simulation,
  } as StressRunState);

  if (desired === current) return trace;
  const next = nextStep(current);
  const target = next === desired ? next : desired;
  return {
    tenantId: context.tenantId,
    active: target,
    steps: [
      ...trace.steps,
      {
        status: target,
        startedAt: new Date().toISOString(),
        note:
          context.plan && context.simulation
            ? 'Plan and simulation present'
            : context.plan
              ? 'Plan available'
              : context.simulation
                ? 'Simulation available'
                : `Waiting for signals (${context.signals.length})`,
      },
    ],
  };
};

export const summarizeLifecycle = (trace: LifecycleTrace): string => {
  const last = trace.steps[trace.steps.length - 1];
  const labels = trace.steps.map((step) => `${step.status}:${step.note}`);
  const elapsed = last.finishedAt ? new Date(last.finishedAt).getTime() - new Date(trace.steps[0].startedAt).getTime() : 0;
  return `status=${trace.active} steps=${labels.length} elapsedMs=${elapsed} path=${labels.join(' > ')}`;
};

export const validateLifecycleCompleteness = (trace: LifecycleTrace): ReadonlyArray<string> => {
  const required: LifecycleStatus[] = ['validated', 'planned', 'simulated', 'audited', 'executing', 'finalized'];
  const present = new Set(trace.steps.map((step) => step.status));
  const missing: string[] = [];
  for (const status of required) {
    if (!present.has(status)) {
      missing.push(`Missing lifecycle status ${status}`);
    }
  }
  return missing;
};
