import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import { ok, fail, type Result } from '@shared/result';
import type { CommandArtifact, CommandArtifactEnvelope } from '@domain/recovery-operations-models/incident-command-artifacts';
import type { CommandWindowForecast, CommandWindowPrediction } from '@domain/recovery-operations-models/command-window-forecast';
import type { CadencePlan } from '@domain/recovery-operations-models/control-plane-cadence';
import type {
  ExecutionContract,
  ExecutionPolicy,
  ExecutionSummary,
} from '@domain/recovery-operations-models/recovery-execution-contract';

export type CommandHubFailure = 'not-found' | 'conflict' | 'validation-error' | 'dynamodb-error' | 'query-limit';

export interface CommandHubCommandStore {
  readonly upsertArtifact: (artifact: CommandArtifact) => Promise<Result<CommandHubRecordBag, CommandHubFailure>>;
  readonly upsertTimeline: (
    timeline: readonly CommandArtifactTimelineItem[],
  ) => Promise<Result<CommandHubRecordBag[], CommandHubFailure>>;
  readonly readArtifact: (tenant: string, commandId: string) => Promise<Result<CommandArtifactEnvelope | undefined, CommandHubFailure>>;
  readonly queryArtifacts: (query: CommandArtifactQuery) => Promise<Result<CommandArtifactEnvelope[], CommandHubFailure>>;
  readonly upsertForecast: (
    forecast: CommandWindowForecast,
    prediction?: CommandWindowPrediction,
  ) => Promise<Result<CommandHubRecordBag, CommandHubFailure>>;
  readonly upsertCadence: (plan: CadencePlan) => Promise<Result<CommandHubRecordBag, CommandHubFailure>>;
  readonly readCadence: (tenant: string, commandId: string) => Promise<Result<CadencePlan | undefined, CommandHubFailure>>;
  readonly upsertExecution: (execution: ExecutionContract) => Promise<Result<CommandHubRecordBag, CommandHubFailure>>;
  readonly readExecution: (tenant: string, executionId: string) => Promise<Result<ExecutionContract | undefined, CommandHubFailure>>;
  readonly upsertPolicy: (policy: ExecutionPolicy) => Promise<Result<CommandHubRecordBag, CommandHubFailure>>;
  readonly readExecutionSummary: (executionId: string) => Promise<Result<ExecutionSummary | undefined, CommandHubFailure>>;
  readonly close: () => Promise<Result<void, CommandHubFailure>>;
}

export type CommandArtifactTimelineItem = {
  readonly artifactId: Brand<string, 'CommandArtifactId'>;
  readonly timestamp: string;
  readonly action: 'created' | 'updated' | 'routed' | 'executed' | 'failed';
  readonly actor: string;
  readonly details: string;
};

export type CommandArtifactQuery = {
  readonly tenant?: string;
  readonly categories?: readonly string[];
  readonly severities?: readonly string[];
  readonly owners?: readonly string[];
  readonly search?: string;
  readonly changedAfter?: string;
  readonly changedBefore?: string;
};

export interface CommandHubRecordBag {
  readonly pk: Brand<string, 'CommandHubPartitionKey'>;
  readonly sk: Brand<string, 'CommandHubSortKey'>;
  readonly type: 'artifact' | 'forecast' | 'cadence' | 'execution' | 'timeline';
  readonly payload: Record<string, unknown>;
}

interface CommandHubArtifactRecord {
  readonly artifact?: CommandArtifact;
  readonly artifactEnvelope?: CommandArtifactEnvelope;
  readonly forecast?: CommandWindowForecast;
  readonly forecastPrediction?: CommandWindowPrediction;
  readonly cadence?: CadencePlan;
  readonly execution?: ExecutionContract;
  readonly policy?: ExecutionPolicy;
  readonly summary?: ExecutionSummary;
  readonly timeline: readonly CommandArtifactTimelineItem[];
}

export class InMemoryCommandHubStore implements CommandHubCommandStore {
  private readonly map = new Map<string, CommandHubArtifactRecord>();

  private tenantCommandKey(tenant: string, commandId: string): string {
    return `${tenant}::${commandId}`;
  }

  private toPk(tenant: string): Brand<string, 'CommandHubPartitionKey'> {
    return withBrand(`tenant#${tenant}`, 'CommandHubPartitionKey');
  }

  private toSk(commandId: string, suffix: string): Brand<string, 'CommandHubSortKey'> {
    return withBrand(`${commandId}#${suffix}`, 'CommandHubSortKey');
  }

  async upsertArtifact(artifact: CommandArtifact): Promise<Result<CommandHubRecordBag, CommandHubFailure>> {
    const commandId = String(artifact.payload.commandId);
    const tenant = String(artifact.payload.tenant);
    const key = this.tenantCommandKey(tenant, commandId);
    const existing = this.map.get(key) ?? { timeline: [] };
    const envelope: CommandArtifactEnvelope = {
      key: withBrand(`${commandId}:envelope`, 'CommandArtifactKey'),
      artifact: artifact.payload,
      tenant: withBrand(artifact.payload.tenant, 'TenantId'),
      metadata: {
        source: 'planner',
        sourceId: withBrand(`artifact:${commandId}`, 'CommandArtifactId'),
        generatedBy: 'recovery-operations-store',
        generatedAt: artifact.payload.updatedAt,
      },
    };

    this.map.set(key, {
      ...existing,
      artifact,
      artifactEnvelope: envelope,
    });

    return ok({
      pk: this.toPk(tenant),
      sk: this.toSk(commandId, 'artifact'),
      type: 'artifact',
      payload: JSON.parse(JSON.stringify(envelope)),
    } as CommandHubRecordBag);
  }

  async upsertTimeline(
    timeline: readonly CommandArtifactTimelineItem[],
  ): Promise<Result<CommandHubRecordBag[], CommandHubFailure>> {
    if (timeline.length > 300) {
      return fail('query-limit');
    }

    const records: CommandHubRecordBag[] = timeline.map((entry) => {
      const key = this.tenantCommandKey('global', String(entry.artifactId));
      const current = this.map.get(key) ?? { timeline: [] };
      this.map.set(key, {
        ...current,
        timeline: [...current.timeline, entry],
      });

      return {
        pk: this.toPk('global'),
        sk: this.toSk(`${entry.artifactId}`, `timeline:${Date.now()}`),
        type: 'timeline',
        payload: entry as unknown as Record<string, unknown>,
      };
    });

    return ok(records);
  }

  async readArtifact(tenant: string, commandId: string): Promise<Result<CommandArtifactEnvelope | undefined, CommandHubFailure>> {
    return ok(this.map.get(this.tenantCommandKey(tenant, commandId))?.artifactEnvelope);
  }

  async queryArtifacts(query: CommandArtifactQuery): Promise<Result<CommandArtifactEnvelope[], CommandHubFailure>> {
    const items: CommandArtifactEnvelope[] = [];

    for (const record of this.map.values()) {
      if (!record.artifactEnvelope) {
        continue;
      }
      if (query.tenant && String(record.artifactEnvelope.tenant) !== query.tenant) {
        continue;
      }
      if (query.categories?.length) {
        if (!query.categories.includes(record.artifactEnvelope.artifact.category)) {
          continue;
        }
      }
      if (query.owners?.length && !query.owners.includes(record.artifactEnvelope.artifact.owner)) {
        continue;
      }
      if (query.search) {
        const haystack = `${record.artifactEnvelope.artifact.title} ${record.artifactEnvelope.artifact.description}`.toLowerCase();
        if (!haystack.includes(query.search.toLowerCase())) {
          continue;
        }
      }
      if (query.changedAfter && record.artifactEnvelope.artifact.updatedAt < query.changedAfter) {
        continue;
      }
      if (query.changedBefore && record.artifactEnvelope.artifact.updatedAt > query.changedBefore) {
        continue;
      }
      items.push(record.artifactEnvelope);
    }

    return ok(items);
  }

  async upsertForecast(
    forecast: CommandWindowForecast,
    prediction?: CommandWindowPrediction,
  ): Promise<Result<CommandHubRecordBag, CommandHubFailure>> {
    const key = this.tenantCommandKey(String(forecast.tenant), String(forecast.commandId));
    const current = this.map.get(key) ?? { timeline: [] };
    this.map.set(key, {
      ...current,
      forecast,
      forecastPrediction: prediction,
    });

    return ok({
      pk: this.toPk(String(forecast.tenant)),
      sk: this.toSk(String(forecast.commandId), 'forecast'),
      type: 'forecast',
      payload: {
        forecast,
        prediction,
      },
    });
  }

  async upsertCadence(plan: CadencePlan): Promise<Result<CommandHubRecordBag, CommandHubFailure>> {
    const key = this.tenantCommandKey(String(plan.tenant), String(plan.commandId));
    const current = this.map.get(key) ?? { timeline: [] };
    this.map.set(key, {
      ...current,
      cadence: plan,
    });

    return ok({
      pk: this.toPk(String(plan.tenant)),
      sk: this.toSk(String(plan.commandId), 'cadence'),
      type: 'cadence',
      payload: JSON.parse(JSON.stringify(plan)),
    });
  }

  async readCadence(tenant: string, commandId: string): Promise<Result<CadencePlan | undefined, CommandHubFailure>> {
    return ok(this.map.get(this.tenantCommandKey(tenant, commandId))?.cadence);
  }

  async upsertExecution(execution: ExecutionContract): Promise<Result<CommandHubRecordBag, CommandHubFailure>> {
    const tenant = String(execution.tenant ?? execution.command.payload.tenant);
    const commandId = String(execution.command.payload.commandId);
    const key = this.tenantCommandKey(tenant, commandId);
    const current = this.map.get(key) ?? { timeline: [] };
    this.map.set(key, { ...current, execution });

    return ok({
      pk: this.toPk(tenant),
      sk: this.toSk(String(execution.contractId), 'execution'),
      type: 'execution',
      payload: JSON.parse(JSON.stringify(execution)),
    });
  }

  async readExecution(tenant: string, executionId: string): Promise<Result<ExecutionContract | undefined, CommandHubFailure>> {
    const all = Array.from(this.map.values());
    const value = all.find((entry) => String(entry.execution?.contractId) === executionId && String(entry.execution?.tenant ?? tenant) === tenant);
    return ok(value?.execution);
  }

  async upsertPolicy(policy: ExecutionPolicy): Promise<Result<CommandHubRecordBag, CommandHubFailure>> {
    const key = this.tenantCommandKey('global', String(policy.policyId));
    const current = this.map.get(key) ?? { timeline: [] };
    this.map.set(key, { ...current, policy });

    return ok({
      pk: this.toPk('global'),
      sk: this.toSk(String(policy.policyId), 'policy'),
      type: 'execution',
      payload: JSON.parse(JSON.stringify(policy)),
    });
  }

  async readExecutionSummary(executionId: string): Promise<Result<ExecutionSummary | undefined, CommandHubFailure>> {
    const records = Array.from(this.map.values());
    const value = records.find((entry) => String(entry.execution?.contractId) === executionId);
    return ok(value?.summary);
  }

  async close(): Promise<Result<void, CommandHubFailure>> {
    this.map.clear();
    return ok(undefined);
  }
}

export const toCommandHubCommandStoreRecord = (record: CommandHubRecordBag, _tenant: string): CommandHubRecordBag => record;

export const commandHubRecordToAttributeMap = (record: CommandHubRecordBag): Record<string, unknown> => {
  return {
    pk: String(record.pk),
    sk: String(record.sk),
    type: record.type,
    payload: record.payload,
  };
};

export const commandHubRecordFromAttributeMap = (item: Record<string, unknown>): CommandHubRecordBag => {
  const entry = item as {
    pk?: unknown;
    sk?: unknown;
    type?: string;
    payload?: Record<string, unknown>;
  };

  return {
    pk: withBrand(String(entry.pk ?? 'tenant#global'), 'CommandHubPartitionKey'),
    sk: withBrand(String(entry.sk ?? 'unknown'), 'CommandHubSortKey'),
    type: ((entry.type ?? 'artifact') as CommandHubRecordBag['type']),
    payload: entry.payload ?? {},
  };
};
