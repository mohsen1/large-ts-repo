import { withBrand } from '@shared/core';
import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';
import {
  type CommandArtifact,
  type CommandArtifactEnvelope,
  type CommandArtifactQuery,
  prioritizeArtifactBySeverity,
} from '@domain/recovery-operations-models/incident-command-artifacts';
import { type CommandWindowForecast, type CommandWindowPrediction, forecastWindowClosure } from '@domain/recovery-operations-models/command-window-forecast';
import { buildCadencePlan, findNearBreachStages, type CadencePlan, type CadenceSnapshot, snapshotCadence } from '@domain/recovery-operations-models/control-plane-cadence';
import type {
  ExecutionContract,
  ExecutionPatchResult,
  ExecutionPolicy,
  ExecutionSummary,
} from '@domain/recovery-operations-models/recovery-execution-contract';
import { InMemoryCommandHubStore, type CommandHubCommandStore, type CommandHubFailure } from './command-hub-repository';
import { withBrand as withSharedBrand } from '@shared/core';

export interface CommandHubFacade {
  readonly listArtifacts: (query: CommandArtifactQuery) => Promise<Result<CommandArtifactEnvelope[], CommandHubFailure>>;
  readonly getArtifactById: (tenant: string, commandId: string) => Promise<Result<CommandArtifactEnvelope | undefined, CommandHubFailure>>;
  readonly putArtifact: (artifact: CommandArtifact) => Promise<Result<void, CommandHubFailure>>;
  readonly putForecast: (forecast: CommandWindowForecast) => Promise<Result<CommandWindowPrediction, CommandHubFailure>>;
  readonly putCadence: (plan: CadencePlan) => Promise<Result<CadencePlan, CommandHubFailure>>;
  readonly getCadence: (tenant: string, commandId: string) => Promise<Result<CadencePlan | undefined, CommandHubFailure>>;
  readonly upsertExecution: (execution: ExecutionContract) => Promise<Result<void, CommandHubFailure>>;
  readonly putTimeline: (timeline: readonly {readonly artifactId: string; readonly timestamp: string; readonly action: string; readonly actor: string; readonly details: string; }[]) => Promise<Result<void, CommandHubFailure>>;
  readonly summarize: (tenant: string) => Promise<Result<CommandHubSummary, CommandHubFailure>>;
}

export interface CommandHubSummary {
  readonly tenant: string;
  readonly totalArtifacts: number;
  readonly activeCommandCount: number;
  readonly avgForecastScore: number;
  readonly criticalWindowCount: number;
  readonly nearBreachCadenceCount: number;
}

const commandHubArtifactToPriority = (artifactA: CommandArtifactEnvelope, artifactB: CommandArtifactEnvelope): number => {
  const sampleA: CommandArtifact = {
    id: withSharedBrand(String(artifactA.artifact.commandId), 'CommandArtifactId'),
    payload: artifactA.artifact,
    checksum: withSharedBrand('generated-a', 'CommandArtifactChecksum'),
    version: 1,
  };
  const sampleB: CommandArtifact = {
    id: withSharedBrand(String(artifactB.artifact.commandId), 'CommandArtifactId'),
    payload: artifactB.artifact,
    checksum: withSharedBrand('generated-b', 'CommandArtifactChecksum'),
    version: 1,
  };

  return prioritizeArtifactBySeverity(sampleA, sampleB);
};

export class CommandHubFacadeService implements CommandHubFacade {
  constructor(private readonly store: CommandHubCommandStore) {}

  async listArtifacts(query: CommandArtifactQuery): Promise<Result<CommandArtifactEnvelope[], CommandHubFailure>> {
    return this.store.queryArtifacts(query);
  }

  async getArtifactById(tenant: string, commandId: string): Promise<Result<CommandArtifactEnvelope | undefined, CommandHubFailure>> {
    return this.store.readArtifact(tenant, commandId);
  }

  async putArtifact(artifact: CommandArtifact): Promise<Result<void, CommandHubFailure>> {
    const result = await this.store.upsertArtifact(artifact);
    if (!result.ok) {
      return result;
    }

    return ok(undefined);
  }

  async putForecast(forecast: CommandWindowForecast): Promise<Result<CommandWindowPrediction, CommandHubFailure>> {
    const prediction = forecastWindowClosure(forecast);
    const persisted = await this.store.upsertForecast(forecast, prediction);
    if (!persisted.ok) {
      return persisted;
    }

    return ok(prediction);
  }

  async putCadence(plan: CadencePlan): Promise<Result<CadencePlan, CommandHubFailure>> {
    const persisted = await this.store.upsertCadence(plan);
    if (!persisted.ok) {
      return persisted;
    }
    return ok(plan);
  }

  async getCadence(tenant: string, commandId: string): Promise<Result<CadencePlan | undefined, CommandHubFailure>> {
    return this.store.readCadence(tenant, commandId);
  }

  async upsertExecution(execution: ExecutionContract): Promise<Result<void, CommandHubFailure>> {
    const persisted = await this.store.upsertExecution(execution);
    if (!persisted.ok) {
      return persisted;
    }

    const timeline = [
      {
        artifactId: String(execution.command.payload.commandId),
        timestamp: execution.updatedAt,
        action: 'executed',
        actor: execution.intent.approvedBy ?? 'automation',
        details: `state=${execution.intent.state}`,
      },
    ];

    const timelineResult = await this.putTimeline(timeline);
    if (!timelineResult.ok) {
      return timelineResult;
    }

    return ok(undefined);
  }

  async putTimeline(
    timeline: readonly { readonly artifactId: string; readonly timestamp: string; readonly action: string; readonly actor: string; readonly details: string; }[],
  ): Promise<Result<void, CommandHubFailure>> {
    const result = await this.store.upsertTimeline(
      timeline.map((entry) => ({
        artifactId: withBrand(entry.artifactId, 'CommandArtifactId'),
        timestamp: entry.timestamp,
        action: entry.action === 'updated' || entry.action === 'failed' || entry.action === 'executed' || entry.action === 'routed'
          ? entry.action
          : 'created',
        actor: entry.actor,
        details: entry.details,
      })),
    );

    if (!result.ok) {
      return result;
    }

    return ok(undefined);
  }

  async summarize(tenant: string): Promise<Result<CommandHubSummary, CommandHubFailure>> {
    const artifactsResult = await this.store.queryArtifacts({ tenant });
    if (!artifactsResult.ok) {
      return artifactsResult;
    }

    const sortedArtifacts = [...artifactsResult.value].sort(commandHubArtifactToPriority);
    const active = sortedArtifacts.filter((artifact) =>
      Boolean(artifact.artifact.dueAt ? new Date(artifact.artifact.dueAt).getTime() > Date.now() : true),
    );

    const query = await this.store.readCadence(`${tenant}`, `${tenant}-cadence`);
    const plan = query.ok && query.value ? [query.value] : [];

    const nearBreachCadenceCount = plan.filter((entry) => findNearBreachStages(entry).length > 0).length;
    const criticalWindowCount = sortedArtifacts.filter((artifact) => artifact.artifact.severity === 'critical').length;

    return ok({
      tenant,
      totalArtifacts: sortedArtifacts.length,
      activeCommandCount: active.length,
      avgForecastScore: 0,
      criticalWindowCount,
      nearBreachCadenceCount,
    });
  }
}

const inMemoryFacade = new CommandHubFacadeService(new InMemoryCommandHubStore());

export const buildCommandHubFacade = (): CommandHubFacade => inMemoryFacade;

export const summarizeCommandHubForTenant = async (
  _facade: CommandHubFacade,
  tenant: string,
): Promise<Result<CommandHubSummary, CommandHubFailure>> => {
  return inMemoryFacade.summarize(tenant);
};

export const buildExecutionPatchResult = (
  contractId: string,
  commandPatch: ExecutionPatchResult['commandPatch'],
  updatedContract: ExecutionContract,
  changed: readonly string[],
): ExecutionPatchResult => {
  return {
    contractId: withBrand(contractId, 'ExecutionContractId'),
    commandPatch,
    updatedContract,
    changedFields: changed,
  };
};

export const buildCommandHubPolicyDefaults = (): ExecutionPolicy => ({
  policyId: withBrand('policy:global:recovery-operations', 'ExecutionPolicyId'),
  requireOperatorApproval: false,
  requireForecastConfidence: 0.35,
  maxConcurrentCommands: 12,
  escalationPath: ['sre-oncall', 'recovery-director', 'vp-engineering'],
});

export const inferExecutionSummary = (execution: ExecutionContract): ExecutionSummary => ({
  contractId: execution.contractId,
  executionMs: execution.intent.state === 'succeeded' ? 2_000 : 0,
  state: execution.intent.state,
  stepCount: execution.intent.state === 'succeeded' ? 3 : 1,
  successRate: execution.intent.state === 'succeeded' ? 1 : 0,
  updatedAt: new Date().toISOString(),
});

export const createCadenceSnapshot = (tenant: string, commandId: string): CadenceSnapshot => {
  const plan = buildCadencePlan(withBrand(tenant, 'TenantId'), withBrand(commandId, 'CommandArtifactId'), 4);
  return snapshotCadence(plan);
};
