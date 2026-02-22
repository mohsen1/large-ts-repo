import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import { Logger } from '@platform/logging';
import type {
  ActionCandidate,
  ActionDependency,
  PlanInput,
  ScenarioId,
  ScenarioPolicy,
  TenantId,
} from '@domain/recovery-scenario-planner';
import { planSimulation, type PlanOutput } from '@domain/recovery-scenario-planner';
import { type ScenarioOrchestrationCommand } from './commands';
import type { RecoveryScenarioRepository } from '@data/recovery-scenario-store';
import { toScenarioRecord } from '@data/recovery-scenario-store';
import { defaultClients, notifyRecoveryScenario } from '@infrastructure/recovery-scenario-notifier';

export { defaultClients };

type OrchestrationPolicy = ScenarioPolicy;

type SimulationPayload = {
  readonly scenarioId: ScenarioId;
  readonly output: PlanOutput;
  readonly policy: OrchestrationPolicy;
};

export interface ResolvedPolicy {
  readonly policy: ScenarioPolicy;
  readonly tenantId: string;
}

export const buildPolicyForTenant = (tenantId: string): ResolvedPolicy => ({
  tenantId,
  policy: {
    policyId: `${tenantId}-scenario-policy` as ScenarioPolicy['policyId'],
    tenantId: tenantId as TenantId,
    priorityBuckets: ['low', 'medium', 'high', 'critical'],
    mustMaintainReadiness: true,
    preferredClockSkewSeconds: 30,
    constraints: {
      maxConcurrency: 4,
      allowedCategories: ['rollback', 'evacuate', 'scale', 'patch', 'validate'],
      blackoutWindows: [],
      slaMinutes: 90,
    },
  },
});

export interface ServiceDependencies {
  readonly repository: RecoveryScenarioRepository;
  readonly logger: Logger;
  readonly planHorizonHours: number;
  readonly now?: () => string;
  readonly clients?: ReturnType<typeof defaultClients>;
}

export const compilePlanOutput = (input: PlanInput): PlanOutput => {
  return planSimulation(input);
};

export const compileSimulationArtifacts = (
  command: ScenarioOrchestrationCommand,
): Result<SimulationPayload, Error> => {
  try {
    const scenarioId = `${command.tenantId}-scenario-${Date.now()}` as ScenarioId;
    const signalContext = {
      nowUtc: new Date().toISOString(),
      tenantTimezone: 'UTC',
    };

    const policy = buildPolicyForTenant(command.tenantId as string).policy;
    const sortedSignals = [...command.signals].sort((left, right) => left.timestampUtc.localeCompare(right.timestampUtc));
    const candidates: ActionCandidate[] = [
      {
        actionId: `${scenarioId}-action-01` as ActionCandidate['actionId'],
        service: 'recovery-router',
        category: 'rollback',
        estimatedMinutes: 17,
        sideEffects: ['service-coldstart'],
        rollbackMinutes: 8,
        labels: ['primary'],
        dependency: {
          dependencyId: `${scenarioId}-dep-01` as ActionDependency['dependencyId'],
          dependsOn: [],
          requiredSignalId: sortedSignals[0]?.signalId,
        },
      },
    ];

    const output = compilePlanOutput({
      scenarioId,
      tenantId: command.tenantId as string,
      policy,
      signals: sortedSignals,
      candidates,
      context: signalContext,
    });

    return ok({
      scenarioId,
      output,
      policy,
    });
  } catch (error) {
    return fail(error as Error);
  }
};

export const persistSimulationArtifacts = async (
  artifacts: SimulationPayload,
  repository: RecoveryScenarioRepository,
): Promise<Result<void, Error>> => {
  return repository.save(toScenarioRecord(artifacts.scenarioId, artifacts.policy.tenantId, artifacts.output.simulation));
};

export const notifyScenario = async (
  artifacts: SimulationPayload,
  clients: ReturnType<typeof defaultClients>,
): Promise<Result<readonly string[], Error>> => {
  const sent = await notifyRecoveryScenario(artifacts.output.simulation, {
    eventBridgeClient: clients.eventBridgeClient,
    snsClient: clients.snsClient,
    eventBridgeBusName: clients.eventBridgeBusName,
    snsTopicArn: clients.snsTopicArn,
  });

  if (!sent.ok) return fail(sent.error);
  return ok([
    ...(sent.value.eventId ? [sent.value.eventId] : []),
    ...(sent.value.messageId ? [sent.value.messageId] : []),
  ]);
};

export interface SimulationSummary {
  readonly scenarioId: ScenarioId;
  readonly tenantId: string;
  readonly events: readonly string[];
}

export const buildSimulationSummary = (
  command: ScenarioOrchestrationCommand,
): SimulationSummary => ({
  scenarioId: `${command.tenantId}-summary` as ScenarioId,
  tenantId: command.tenantId as string,
  events: [],
});
