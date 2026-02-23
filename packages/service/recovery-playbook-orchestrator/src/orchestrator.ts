import { ok, fail, type Result } from '@shared/result';
import { createRecoveryPlaybookStore } from '@data/recovery-playbook-orchestration-store';
import { createPlan, projectWindowCoverage } from '@domain/recovery-playbook-orchestration';
import { validateRunCommand } from './validators';
import { evaluatePolicyGate } from './policy';
import { buildSlots, estimateThroughput, makeReadinessSnapshot } from './scheduler';
import { canPublish } from '@domain/recovery-playbook-orchestration';
import type {
  DriftSignal,
  OrchestrationOptions,
  TenantContext,
  RecoveryPlaybookModel,
  HealthIndicator,
  PolicyViolation,
} from '@domain/recovery-playbook-orchestration';
import type { RunResult, PlaybookRunCommand, OrchestratorSummary } from './types';

export interface OrchestrationRuntime {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly context: TenantContext;
  readonly options: OrchestrationOptions;
}

export const createOrchestrator = (
  tenantId: string,
  workspaceId: string,
  context: TenantContext,
  options: OrchestrationOptions = {},
): OrchestrationRuntime => ({
  tenantId,
  workspaceId,
  context,
  options,
});

export const runPlaybookOrchestration = async (
  command: PlaybookRunCommand,
  seed: RecoveryPlaybookModel,
): Promise<Result<RunResult, Error>> => {
  if (!validateRunCommand(command)) {
    return fail(new Error('invalid command'));
  }

  const violations: PolicyViolation[] = evaluatePolicyGate(command.signals, 2);
  const store = createRecoveryPlaybookStore(command.tenant.tenantId);
  const plan = createPlan(seed, {
    mode: command.options?.planningMode,
  });

  const planResult = store.savePlan(plan, 'console', command.workspaceId, 1);
  if (!planResult.ok) {
    return fail(planResult.error);
  }

  const slotPlan = buildSlots(Math.max(1, command.signals.length), command.signals);
  const throughput = estimateThroughput(slotPlan);
  const snapshot = makeReadinessSnapshot(throughput, command.signals);

  const progress = projectWindowCoverage(plan, new Date().toISOString());
  const signalHealth: HealthIndicator[] = [
    {
      key: 'throughput',
      score: Math.round(progress * 100),
      band: progress > 0.66 ? 'green' : progress > 0.33 ? 'amber' : 'red',
      reason: `coverage ${Math.round(progress * 100)}%`,
    },
    {
      key: 'criticality',
      score: snapshot.scores.red,
      band: snapshot.scores.red > 1 ? 'red' : snapshot.scores.red > 0 ? 'amber' : 'green',
      reason: 'critical signal ratio',
    },
    {
      key: 'policy',
      score: violations.length,
      band: violations.length > 0 ? 'amber' : 'green',
      reason: `violations ${violations.length}`,
    },
  ];

  const runResult = store.runAndRecordOutcome(plan, command.workspaceId, command.signals, violations);
  if (!runResult.ok) {
    return fail(runResult.error);
  }

  void canPublish;
  return ok({
    plan,
    outcome: runResult.value.outcome,
    policyViolations: [...violations],
  });
};

export const readWorkspaceSummary = async (
  tenantId: string,
  workspaceId: string,
): Promise<OrchestratorSummary> => {
  const store = createRecoveryPlaybookStore(tenantId);
  const plans = store.listPlans({ tenantId });
  const outcomes = store.listOutcomes(workspaceId);
  const latestPlan = plans[0] ?? ({} as any);
  const latestOutcome = outcomes.at(-1)?.outcome;

  const health: HealthIndicator[] = latestOutcome
    ? [
        {
          key: 'telemetry-health',
          score: latestOutcome.telemetrySnapshot.scores.green,
          band: latestOutcome.finalBand,
          reason: 'latest outcome snapshot',
        },
      ]
    : [];

  return {
    workspace: {
      id: workspaceId,
      tenant: {
        tenantId,
        region: 'us-east-1',
        environment: 'prod',
      },
    },
    latestPlan: latestPlan,
    latestOutcome,
    health,
    signalCount: outcomes.reduce((acc, item) => acc + item.outcome.telemetrySnapshot.scores.green + item.outcome.telemetrySnapshot.scores.amber + item.outcome.telemetrySnapshot.scores.red, 0),
  };
};
