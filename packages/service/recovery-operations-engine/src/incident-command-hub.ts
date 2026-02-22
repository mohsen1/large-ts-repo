import { withBrand } from '@shared/core';
import { fail, ok, type Result } from '@shared/result';
import { z } from 'zod';
import {
  commandArtifactCategorySchema,
  type CommandArtifactCategory,
  buildCommandArtifactChecksum,
  toCommandArtifact,
  isCriticalArtifact,
  type CommandArtifact,
  type CommandArtifactEnvelope,
  type CommandArtifactQuery,
} from '@domain/recovery-operations-models/incident-command-artifacts';
import {
  buildWindowFromSamples,
  type CommandWindowForecast,
  type CommandWindowPrediction,
  type CommandWindowSample,
} from '@domain/recovery-operations-models/command-window-forecast';
import {
  buildCadencePlan,
  type CadencePlan,
  snapshotCadence,
  findNearBreachStages,
  type CadenceSnapshot,
} from '@domain/recovery-operations-models/control-plane-cadence';
import {
  canTransition,
  isExecutionAllowedByPolicy,
  type ExecutionContract,
  type ExecutionPolicy,
  type ExecutionSummary,
} from '@domain/recovery-operations-models/recovery-execution-contract';
import {
  buildCommandHubFacade,
  buildCommandHubPolicyDefaults,
  inferExecutionSummary,
  type CommandHubFacade,
  type CommandHubSummary,
} from '@data/recovery-operations-store/command-hub-facade';

export type IncidentCommandHubFailure =
  | 'invalid-input'
  | 'validation-error'
  | 'not-found'
  | 'policy-blocked'
  | 'conflict'
  | CommandHubFacadeFailure;

type CommandHubFacadeFailure =
  | 'not-found'
  | 'conflict'
  | 'validation-error'
  | 'dynamodb-error'
  | 'query-limit'
  | 'blocked';

export interface IncidentCommandHubError {
  readonly reason: IncidentCommandHubFailure;
  readonly message: string;
}

export interface IncidentCommandHubInputs {
  readonly tenant: string;
  readonly commandSeed: {
    readonly commandId: string;
    readonly tenant: string;
    readonly owner: string;
    readonly title: string;
    readonly description: string;
    readonly category: CommandArtifactCategory;
    readonly severity: 'critical' | 'high' | 'normal' | 'low';
    readonly tags: readonly string[];
  };
  readonly stageCount?: number;
}

export interface IncidentCommandHubService {
  readonly registerSeed: (inputs: IncidentCommandHubInputs) => Promise<Result<CommandArtifactEnvelope, IncidentCommandHubError>>;
  readonly computeForecast: (commandId: string) => Promise<Result<CommandWindowPrediction, IncidentCommandHubError>>;
  readonly buildCadence: (tenant: string, commandId: string, stageCount?: number) => Promise<Result<CadencePlan, IncidentCommandHubError>>;
  readonly executeCommand: (commandId: string) => Promise<Result<ExecutionSummary, IncidentCommandHubError>>;
  readonly summarize: (tenant: string) => Promise<Result<CommandHubSummary, IncidentCommandHubError>>;
  readonly inspectCadence: (tenant: string) => Promise<Result<readonly CadenceSnapshot[], IncidentCommandHubError>>;
  readonly inspectArtifact: (query: CommandArtifactQuery) => Promise<Result<readonly CommandArtifactEnvelope[], IncidentCommandHubError>>;
}

const commandHubInputSchema = z.object({
  tenant: z.string().min(2),
  commandSeed: z.object({
    commandId: z.string().min(1),
    tenant: z.string().min(2),
    owner: z.string().min(2),
    title: z.string().min(3),
    description: z.string().min(10),
    category: commandArtifactCategorySchema,
    severity: z.enum(['critical', 'high', 'normal', 'low']),
    tags: z.array(z.string()),
  }),
  stageCount: z.number().int().min(1).max(12).optional(),
});

export class IncidentCommandHubManager implements IncidentCommandHubService {
  constructor(private readonly facade: CommandHubFacade = buildCommandHubFacade()) {}

  async registerSeed(inputs: IncidentCommandHubInputs): Promise<Result<CommandArtifactEnvelope, IncidentCommandHubError>> {
    const parsed = commandHubInputSchema.safeParse(inputs);
    if (!parsed.success) {
      return fail({
        reason: 'invalid-input',
        message: parsed.error.message,
      });
    }

    const commandSeed = parsed.data.commandSeed;
    const artifact = toCommandArtifact({
      commandId: commandSeed.commandId,
      tenant: commandSeed.tenant,
      owner: commandSeed.owner,
      title: commandSeed.title,
      description: commandSeed.description,
      category: commandSeed.category,
      severity: commandSeed.severity,
      tags: [...commandSeed.tags],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerContacts: [
        {
          name: commandSeed.owner,
          role: 'automation',
          email: `${commandSeed.owner}@example.invalid`,
        },
      ],
      preconditions: ['routing-ready', 'quota-ok'],
      dependencies: ['global-orchestrator'],
      executionHints: [
        {
          command: 'validate-state',
          rationale: 'seed validation',
          estimatedSeconds: 120,
        },
      ],
    });

    if (isCriticalArtifact(artifact)) {
      void artifact.payload; // keep branch explicit for policy observability
    }

    const persisted = await this.facade.putArtifact(artifact);
    if (!persisted.ok) {
      return fail({
        reason: persisted.error,
        message: `unable to persist command artifact ${persisted.error}`,
      });
    }

    const checksum = buildCommandArtifactChecksum(artifact.payload);
    const envelope: CommandArtifactEnvelope = {
      key: withBrand(`${artifact.payload.commandId}:envelope`, 'CommandArtifactKey'),
      artifact: artifact.payload,
      tenant: withBrand(commandSeed.tenant, 'TenantId'),
      metadata: {
        source: 'planner',
        sourceId: withBrand('incident-hub', 'CommandArtifactId'),
        generatedBy: 'incident-command-hub',
        generatedAt: artifact.payload.updatedAt,
      },
    };

    if (!checksum) {
      return fail({ reason: 'validation-error', message: 'checksum generation failed' });
    }

    return ok(envelope);
  }

  async computeForecast(commandId: string): Promise<Result<CommandWindowPrediction, IncidentCommandHubError>> {
    const artifactResult = await this.facade.getArtifactById('global', commandId);
    if (!artifactResult.ok) {
      return fail({ reason: artifactResult.error, message: 'artifact query failed' });
    }

    const artifact = artifactResult.value;
    if (!artifact) {
      return fail({ reason: 'not-found', message: `command ${commandId} is missing` });
    }

    const samples: readonly CommandWindowSample[] = [
      {
        sampleId: withBrand(`${commandId}-sample`, 'CommandWindowSampleId'),
        commandId: withBrand(artifact.artifact.commandId, 'CommandArtifactId'),
        state: 'open',
        startedAt: new Date().toISOString(),
        metrics: [
          {
            metricId: withBrand(`${artifact.artifact.commandId}-score`, 'CommandWindowMetricId'),
            name: 'artifact-risk',
            value: artifact.artifact.severity === 'critical' ? 0.3 : artifact.artifact.severity === 'high' ? 0.45 : 0.8,
            weight: 1,
            unit: 'score',
            goodDirection: 'higher',
          },
        ],
        contributors: artifact.artifact.tags.map((tag) => ({ area: tag, impact: tag.length })),
      },
      {
        sampleId: withBrand(`${commandId}-sample-2`, 'CommandWindowSampleId'),
        commandId: withBrand(artifact.artifact.commandId, 'CommandArtifactId'),
        state: 'active',
        startedAt: new Date().toISOString(),
        metrics: [
          {
            metricId: withBrand(`${artifact.artifact.commandId}-score-2`, 'CommandWindowMetricId'),
            name: 'artifact-readiness',
            value: Math.max(0.3, artifact.artifact.tags.length * 0.15),
            weight: 0.8,
            unit: 'score',
            goodDirection: 'higher',
          },
        ],
        contributors: [{ area: artifact.artifact.owner, impact: artifact.artifact.title.length }],
      },
    ];

    const forecast: CommandWindowForecast = buildWindowFromSamples(
      samples,
      withBrand(artifact.tenant, 'TenantId'),
      withBrand(artifact.artifact.commandId, 'CommandArtifactId'),
    );

    const predictionResult = await this.facade.putForecast(forecast);
    if (!predictionResult.ok) {
      return fail({ reason: predictionResult.error, message: `forecast persist failed (${predictionResult.error})` });
    }

    return ok(predictionResult.value);
  }

  async buildCadence(tenant: string, commandId: string, stageCount = 5): Promise<Result<CadencePlan, IncidentCommandHubError>> {
    const artifactResult = await this.facade.getArtifactById(tenant, commandId);
    if (!artifactResult.ok) {
      return fail({ reason: artifactResult.error, message: 'artifact query failed' });
    }

    const artifact = artifactResult.value;
    if (!artifact) {
      return fail({ reason: 'not-found', message: `command ${commandId} not found` });
    }

    const plan = buildCadencePlan(withBrand(tenant, 'TenantId'), withBrand(commandId, 'CommandArtifactId'), stageCount);
    const persisted = await this.facade.putCadence(plan);
    if (!persisted.ok) {
      return fail({ reason: persisted.error, message: `cadence persist ${persisted.error}` });
    }

    return ok(persisted.value);
  }

  async executeCommand(commandId: string): Promise<Result<ExecutionSummary, IncidentCommandHubError>> {
    const artifactResult = await this.facade.getArtifactById('global', commandId);
    if (!artifactResult.ok || !artifactResult.value) {
      return fail({ reason: artifactResult.ok ? 'not-found' : artifactResult.error, message: 'command missing' });
    }

    const forecastResult = await this.computeForecast(commandId);
    if (!forecastResult.ok) {
      return fail({ reason: forecastResult.error.reason, message: 'forecast failed' });
    }

    const policy = buildCommandHubPolicyDefaults();
    const commandContract = this.buildExecutionContract(artifactResult.value, forecastResult.value.forecast, policy);
    const executionResult = await this.facade.upsertExecution(commandContract);
    if (!executionResult.ok) {
      return fail({ reason: executionResult.error, message: 'execution persist failed' });
    }

    const summary = inferExecutionSummary(commandContract);
    return ok(summary);
  }

  private buildExecutionContract(
    artifact: CommandArtifactEnvelope,
    forecast: CommandWindowForecast,
    policy: ExecutionPolicy,
  ): ExecutionContract {
    const contract: ExecutionContract = {
      contractId: withBrand(`${artifact.artifact.commandId}:contract`, 'ExecutionContractId'),
      tenant: artifact.tenant,
      command: {
        id: withBrand(artifact.artifact.commandId, 'CommandArtifactId'),
        payload: artifact.artifact,
        checksum: withBrand(buildCommandArtifactChecksum(artifact.artifact), 'CommandArtifactChecksum'),
        version: 1,
      },
      intent: {
        intentId: withBrand(`${artifact.artifact.commandId}:intent`, 'ExecutionIntentId'),
        commandId: withBrand(artifact.artifact.commandId, 'CommandArtifactId'),
        state: 'initialized',
        targetState: 'succeeded',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['automated', 'command-hub'],
      retries: {
        max: policy.maxConcurrentCommands,
        used: 0,
      },
      forecast,
    };

    if (!canTransition('planned', contract.intent.state)) {
      return {
        ...contract,
        intent: {
          ...contract.intent,
          state: 'initialized',
        },
      };
    }

    if (!isExecutionAllowedByPolicy(contract, policy)) {
      return {
        ...contract,
        intent: {
          ...contract.intent,
          state: 'blocked',
        },
      };
    }

    return contract;
  }

  async summarize(tenant: string): Promise<Result<CommandHubSummary, IncidentCommandHubError>> {
    const result = await this.facade.summarize(tenant);
    if (!result.ok) {
      return fail({ reason: result.error, message: `summarize failed: ${result.error}` });
    }
    return ok(result.value);
  }

  async inspectCadence(tenant: string): Promise<Result<readonly CadenceSnapshot[], IncidentCommandHubError>> {
    const artifacts = await this.facade.listArtifacts({ tenant });
    if (!artifacts.ok) {
      return fail({ reason: artifacts.error, message: 'artifact listing failed' });
    }

    const snapshots = artifacts.value.map((artifact) => {
      const plan = buildCadencePlan(withBrand(tenant, 'TenantId'), withBrand(artifact.artifact.commandId, 'CommandArtifactId'), 3);
      return {
        ...snapshotCadence(plan),
        atRiskStageCount: findNearBreachStages(plan).length,
      };
    });

    return ok(snapshots);
  }

  async inspectArtifact(query: CommandArtifactQuery): Promise<Result<readonly CommandArtifactEnvelope[], IncidentCommandHubError>> {
    const artifacts = await this.facade.listArtifacts(query);
    if (!artifacts.ok) {
      return fail({ reason: artifacts.error, message: 'failed listing artifacts' });
    }
    return ok(artifacts.value);
  }
}

export const buildIncidentCommandHubManager = (): IncidentCommandHubService => {
  return new IncidentCommandHubManager();
};

export const buildCommandHubArtifactPatchResult = (
  contractId: string,
  patch: CommandArtifact,
  changedFields: readonly string[],
): ExecutionContract => {
  return {
    contractId: withBrand(contractId, 'ExecutionContractId'),
    tenant: withBrand(patch.payload.tenant, 'TenantId'),
    command: {
      id: patch.id,
      payload: patch.payload,
      checksum: patch.checksum,
      version: patch.version,
    },
    intent: {
      intentId: withBrand(`${contractId}:intent`, 'ExecutionIntentId'),
      commandId: patch.id,
      state: 'initialized',
      targetState: 'succeeded',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['patch-generated'],
    retries: {
      max: 1,
      used: 0,
    },
  };
};

export const isCommandExecutionBlocked = (contract: ExecutionContract): boolean => contract.intent.state === 'blocked';
