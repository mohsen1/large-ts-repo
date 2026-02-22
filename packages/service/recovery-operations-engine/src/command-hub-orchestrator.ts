import { withBrand } from '@shared/core';
import { ok, fail, type Result } from '@shared/result';
import type { RunSession } from '@domain/recovery-operations-models';
import type { CommandArtifactEnvelope } from '@domain/recovery-operations-models/incident-command-artifacts';
import {
  type CommandWindowForecast,
  type CommandWindowPrediction,
  forecastWindowClosure,
} from '@domain/recovery-operations-models/command-window-forecast';
import {
  buildCadencePlan,
  type CadencePlan,
  snapshotCadence,
  type CadenceSnapshot,
  findNearBreachStages,
} from '@domain/recovery-operations-models/control-plane-cadence';
import {
  isExecutionAllowedByPolicy,
  type ExecutionContract,
  type ExecutionPolicy,
  isTerminalExecutionState,
  type ExecutionState,
} from '@domain/recovery-operations-models/recovery-execution-contract';
import { InMemoryCommandHubStore } from '@data/recovery-operations-store/command-hub-repository';
import { buildCommandHubPolicyDefaults, inferExecutionSummary } from '@data/recovery-operations-store/command-hub-facade';

export type CommandHubOrchestratorFailure = 'not-found' | 'invalid-state' | 'conflict' | 'blocked';

export interface CommandHubRunbook {
  readonly commandId: string;
  readonly tenant: string;
  readonly forecast: CommandWindowForecast;
  readonly cadence: CadencePlan;
  readonly execution: ExecutionContract;
}

export interface CadenceIssue {
  readonly commandId: string;
  readonly tenant: string;
  readonly stageCount: number;
  readonly atRiskStages: number;
}

interface OrchestratorContext {
  readonly runsByTenant: Map<string, RunSession[]>;
  readonly artifactsByTenant: Map<string, CommandArtifactEnvelope[]>;
  readonly forecastByCommand: Map<string, CommandWindowForecast>;
  readonly executionByCommand: Map<string, ExecutionContract[]>;
}

export class RecoveryCommandOrchestrator {
  private readonly store = new InMemoryCommandHubStore();
  private readonly context: OrchestratorContext = {
    runsByTenant: new Map(),
    artifactsByTenant: new Map(),
    forecastByCommand: new Map(),
    executionByCommand: new Map(),
  };

  async hydrateArtifacts(artifacts: readonly CommandArtifactEnvelope[]): Promise<Result<void, CommandHubOrchestratorFailure>> {
    if (artifacts.length === 0) {
      return fail('not-found');
    }

    for (const envelope of artifacts) {
      const tenant = String(envelope.tenant);
      const existing = this.context.artifactsByTenant.get(tenant) ?? [];
      this.context.artifactsByTenant.set(tenant, [...existing, envelope]);
    }

    return ok(undefined);
  }

  async registerForecast(
    tenant: string,
    forecast: CommandWindowForecast,
  ): Promise<Result<CommandWindowPrediction, CommandHubOrchestratorFailure>> {
    if (!tenant || forecast.samples.length === 0) {
      return fail('invalid-state');
    }

    const prediction = forecastWindowClosure(forecast);
    this.context.forecastByCommand.set(String(forecast.commandId), forecast);
    return ok(prediction);
  }

  async registerRunSessions(tenant: string, runs: readonly RunSession[]): Promise<Result<number, CommandHubOrchestratorFailure>> {
    if (runs.length === 0) {
      return fail('not-found');
    }

    const previous = this.context.runsByTenant.get(tenant) ?? [];
    this.context.runsByTenant.set(tenant, [...previous, ...runs]);
    return ok(this.context.runsByTenant.get(tenant)?.length ?? 0);
  }

  async buildRunbook(tenant: string, commandId: string): Promise<Result<CommandHubRunbook, CommandHubOrchestratorFailure>> {
    const artifacts = this.context.artifactsByTenant.get(tenant) ?? [];
    const artifact = artifacts.find((entry) => String(entry.artifact.commandId) === commandId);
    if (!artifact) {
      return fail('not-found');
    }

    const forecast = this.context.forecastByCommand.get(String(withBrand(commandId, 'CommandArtifactId')));
    if (!forecast) {
      return fail('invalid-state');
    }

    const cadence = buildCadencePlan(
      withBrand(tenant, 'TenantId'),
      withBrand(commandId, 'CommandArtifactId'),
      4,
    );
    const policy = buildCommandHubPolicyDefaults();
    const contract: ExecutionContract = {
      contractId: withBrand(`${commandId}:contract`, 'ExecutionContractId'),
      tenant: withBrand(tenant, 'TenantId'),
      command: {
        id: withBrand(artifact.artifact.commandId, 'CommandArtifactId'),
        payload: artifact.artifact,
        checksum: withBrand('checksum', 'CommandArtifactChecksum'),
        version: 2,
      },
      intent: {
        intentId: withBrand(`${commandId}:intent`, 'ExecutionIntentId'),
        commandId: withBrand(commandId, 'CommandArtifactId'),
        state: 'initialized',
        targetState: 'succeeded',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['orchestrator'],
      retries: {
        max: policy.maxConcurrentCommands,
        used: 0,
      },
      forecast,
    };

    if (!isExecutionAllowedByPolicy(contract, policy)) {
      return fail('blocked');
    }

    this.context.executionByCommand.set(commandId, [...(this.context.executionByCommand.get(commandId) ?? []), contract]);
    return ok({
      commandId,
      tenant,
      forecast,
      cadence,
      execution: contract,
    });
  }

  async escalateCommand(tenant: string, commandId: string): Promise<Result<readonly string[], CommandHubOrchestratorFailure>> {
    const runbook = await this.buildRunbook(tenant, commandId);
    if (!runbook.ok) {
      return runbook;
    }

    const snapshot = snapshotCadence(runbook.value.cadence);
    const nearBreach = findNearBreachStages(runbook.value.cadence);
    const actions = [
      `status=${snapshot.status}`,
      `stages=${snapshot.stageCount}`,
      `near=${nearBreach.length}`,
      `executions=${this.context.executionByCommand.get(commandId)?.length ?? 0}`,
    ];

    return ok(actions);
  }

  async closeCommand(commandId: string): Promise<Result<ExecutionState, CommandHubOrchestratorFailure>> {
    const executions = this.context.executionByCommand.get(commandId) ?? [];
    if (executions.length === 0) {
      return fail('not-found');
    }

    const last = executions.at(-1);
    if (!last) {
      return fail('not-found');
    }

    return ok(isTerminalExecutionState(last.intent.state) ? last.intent.state : 'running');
  }

  async diagnoseCadenceIssues(tenant: string): Promise<Result<readonly CadenceIssue[], CommandHubOrchestratorFailure>> {
    const artifacts = this.context.artifactsByTenant.get(tenant) ?? [];
    if (artifacts.length === 0) {
      return fail('not-found');
    }

    const issues = artifacts
      .map((envelope) => {
        const plan = buildCadencePlan(withBrand(tenant, 'TenantId'), withBrand(envelope.artifact.commandId, 'CommandArtifactId'), 3);
        const snapshot = snapshotCadence(plan);
        return {
          commandId: String(envelope.artifact.commandId),
          tenant,
          stageCount: snapshot.stageCount,
          atRiskStages: findNearBreachStages(plan).length,
        };
      })
      .filter((issue) => issue.atRiskStages > 0);

    return ok(issues);
  }

  async summarizeExecution(commandId: string): Promise<Result<ReturnType<typeof inferExecutionSummary>, CommandHubOrchestratorFailure>> {
    const executions = this.context.executionByCommand.get(commandId) ?? [];
    const last = executions.at(-1);
    if (!last) {
      return fail('not-found');
    }
    return ok(inferExecutionSummary(last));
  }
}

export const buildRecoveryCommandOrchestrator = (): RecoveryCommandOrchestrator => new RecoveryCommandOrchestrator();

export const isCommandClosable = async (
  orchestrator: RecoveryCommandOrchestrator,
  commandId: string,
): Promise<boolean> => {
  const stateResult = await orchestrator.closeCommand(commandId);
  return stateResult.ok && stateResult.value === 'succeeded';
};
