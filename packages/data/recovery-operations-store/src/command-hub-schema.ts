import { z } from 'zod';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { Brand } from '@shared/core';

import type { CommandArtifactEnvelope, CommandArtifactQuery, CommandArtifactTimelineItem } from '@domain/recovery-operations-models/incident-command-artifacts';
import type { CommandWindowForecast, CommandWindowPrediction } from '@domain/recovery-operations-models/command-window-forecast';
import type { CadencePlan } from '@domain/recovery-operations-models/control-plane-cadence';
import type { ExecutionContract, ExecutionPolicy, ExecutionSummary } from '@domain/recovery-operations-models/recovery-execution-contract';

export interface CommandHubRecord {
  readonly pk: Brand<string, 'CommandHubPartitionKey'>;
  readonly sk: Brand<string, 'CommandHubSortKey'>;
  readonly type: 'artifact' | 'forecast' | 'cadence' | 'execution' | 'timeline';
  readonly payload: Record<string, unknown>;
}

export const commandHubRecordKeySchema = z.object({ pk: z.string(), sk: z.string() });

export const validateEnvelope = (value: unknown): CommandArtifactEnvelope => {
  const parsed = z
    .object({
      key: z.string(),
      artifact: z.record(z.unknown()),
      tenant: z.string(),
      metadata: z.object({
        source: z.enum(['planner', 'automation', 'operator']),
        sourceId: z.string(),
        generatedBy: z.string(),
        generatedAt: z.string(),
      }),
    })
    .passthrough()
    .parse(value) as unknown as CommandArtifactEnvelope;

  return {
    ...parsed,
    tenant: parsed.tenant as Brand<string, 'TenantId'>,
    artifact: parsed.artifact as CommandArtifactEnvelope['artifact'],
    key: parsed.key as Brand<string, 'CommandArtifactKey'>,
    metadata: {
      ...parsed.metadata,
      source: parsed.metadata.source as 'planner' | 'automation' | 'operator',
      sourceId: parsed.metadata.sourceId as Brand<string, 'CommandArtifactId'>,
    },
  };
};

const forecastSchema = z.object({
  windowId: z.string(),
  tenant: z.string(),
  commandId: z.string(),
  expectedCloseAt: z.string(),
  forecastAt: z.string(),
  confidence: z.number(),
  samples: z.array(z.any()),
  riskSignals: z.array(z.string()),
});

export const validateForecast = (value: unknown): CommandWindowForecast => {
  const parsed = forecastSchema.parse(value);
  return {
    ...parsed,
    windowId: parsed.windowId as Brand<string, 'CommandWindowId'>,
    tenant: parsed.tenant as Brand<string, 'TenantId'>,
    commandId: parsed.commandId as Brand<string, 'CommandArtifactId'>,
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    samples: parsed.samples as CommandWindowForecast['samples'],
  };
};

export const validateForecastPrediction = (value: unknown): CommandWindowPrediction => {
  const parsed = z
    .object({
      forecast: forecastSchema,
      probability: z.number().min(0).max(1),
      rationale: z.array(z.string()),
      recommendedActions: z.array(z.string()),
    })
    .parse(value);

  return {
    ...parsed,
    forecast: validateForecast(parsed.forecast),
  };
};

export const validateCadence = (value: unknown): CadencePlan => {
  const parsed = z.record(z.unknown()).parse(value) as unknown as CadencePlan;
  return {
    ...parsed,
    cadenceId: String(parsed.cadenceId) as Brand<string, 'CadencePlanId'>,
    tenant: String(parsed.tenant) as Brand<string, 'TenantId'>,
    commandId: String(parsed.commandId) as Brand<string, 'CommandArtifactId'>,
    stages: (parsed.stages as CadencePlan['stages']) ?? [],
    severity: (parsed.severity as CadencePlan['severity']) ?? 'low',
    createdAt: String(parsed.createdAt ?? new Date().toISOString()),
    updatedAt: String(parsed.updatedAt ?? new Date().toISOString()),
    tags: (parsed.tags as readonly string[]) ?? [],
  };
};

export const validateExecutionSummary = (value: unknown): ExecutionSummary => {
  const parsed = z
    .object({
      contractId: z.string(),
      executionMs: z.number().nonnegative(),
      state: z.string(),
      stepCount: z.number().nonnegative(),
      successRate: z.number(),
      updatedAt: z.string(),
    })
    .parse(value);

  return {
    ...parsed,
    contractId: parsed.contractId as Brand<string, 'ExecutionContractId'>,
    state: parsed.state as ExecutionSummary['state'],
    successRate: Math.max(0, Math.min(1, parsed.successRate)),
  };
};

export const validateExecutionPolicy = (value: unknown): ExecutionPolicy => {
  const parsed = z
    .object({
      policyId: z.string(),
      requireOperatorApproval: z.boolean(),
      requireForecastConfidence: z.number(),
      maxConcurrentCommands: z.number(),
      escalationPath: z.array(z.string()),
    })
    .parse(value);

  return {
    ...parsed,
    policyId: parsed.policyId as Brand<string, 'ExecutionPolicyId'>,
    requireForecastConfidence: Math.max(0, Math.min(1, parsed.requireForecastConfidence)),
  };
};

export const validateExecutionContract = (value: unknown): ExecutionContract => {
  const parsed = z.record(z.unknown()).parse(value) as Record<string, unknown>;
  return {
    contractId: String(parsed.contractId ?? '') as Brand<string, 'ExecutionContractId'>,
    tenant: String(parsed.tenant ?? 'global') as Brand<string, 'TenantId'>,
    command: parsed.command as ExecutionContract['command'],
    intent: {
      intentId: String((parsed as { intent?: { intentId?: string } }).intent?.intentId ?? '') as Brand<string, 'ExecutionIntentId'>,
      commandId: String((parsed as { intent?: { commandId?: string } }).intent?.commandId ?? '') as Brand<string, 'CommandArtifactId'>,
      state: ((parsed as { intent?: { state?: string } }).intent?.state ?? 'running') as ExecutionContract['intent']['state'],
      targetState: ((parsed as { intent?: { targetState?: string } }).intent?.targetState ?? 'succeeded') as ExecutionContract['intent']['targetState'],
      approvedBy: (parsed as { intent?: { approvedBy?: string } }).intent?.approvedBy,
    },
    createdAt: String(parsed.createdAt ?? new Date().toISOString()),
    updatedAt: String(parsed.updatedAt ?? new Date().toISOString()),
    tags: (parsed.tags as readonly string[]) ?? [],
    retries: (parsed.retries as ExecutionContract['retries']) ?? { max: 0, used: 0 },
    forecast: parsed.forecast as CommandWindowForecast | undefined,
  };
};

export const validateTimeline = (value: unknown): readonly CommandArtifactTimelineItem[] => {
  const parsed = z
    .array(
      z.object({
        artifactId: z.string(),
        timestamp: z.string(),
        action: z.enum(['created', 'updated', 'routed', 'executed', 'failed']),
        actor: z.string(),
        details: z.string(),
      }),
    )
    .parse(value);

  return parsed.map((entry) => ({
    ...entry,
    artifactId: entry.artifactId as Brand<string, 'CommandArtifactId'>,
  }));
};

export const validateCommandHubQuery = (value: unknown): CommandArtifactQuery => {
  return z
    .object({
      tenant: z.string().optional(),
      categories: z.array(z.string()).optional(),
      severities: z.array(z.string()).optional(),
      owners: z.array(z.string()).optional(),
      search: z.string().optional(),
      changedAfter: z.string().optional(),
      changedBefore: z.string().optional(),
    })
    .parse(value) as CommandArtifactQuery;
};

export const makeCommandHubRecord = (
  pk: string,
  sk: string,
  type: CommandHubRecord['type'],
  payload: Record<string, unknown>,
): CommandHubRecord => ({
  pk: withBrandValue(pk),
  sk: withBrandValue(sk),
  type,
  payload,
});

const withBrandValue = (value: string): Brand<string, never> => value as Brand<string, never>;

export const parseCommandHubRecord = (record: Record<string, unknown>): CommandHubRecord => {
  const parsed = commandHubRecordKeySchema.parse(record);
  const payload =
    typeof record.payload === 'string' ? JSON.parse(record.payload) : record.payload;

  return {
    pk: withBrandValue(String(parsed.pk)) as Brand<string, 'CommandHubPartitionKey'>,
    sk: withBrandValue(String(parsed.sk)) as Brand<string, 'CommandHubSortKey'>,
    type: (record.Type as CommandHubRecord['type']) ?? 'artifact',
    payload: (payload as Record<string, unknown>) ?? {},
  };
};

export const commandHubRecordToItem = (record: CommandHubRecord): Record<string, unknown> => {
  return marshall(
    {
      PK: String(record.pk),
      SK: String(record.sk),
      Type: record.type,
      Payload: JSON.stringify(record.payload),
    } as unknown as Record<string, unknown>,
    { removeUndefinedValues: true },
  ) as unknown as Record<string, unknown>;
};

export const commandHubRecordFromItem = (item: Record<string, unknown>): CommandHubRecord => {
  const parsed = unmarshall(item as unknown as never);
  const payload =
    typeof parsed.Payload === 'string' ? JSON.parse(parsed.Payload as string) : parsed.Payload;
  return {
    pk: withBrandValue(String((parsed as { PK?: string }).PK ?? 'tenant#global')) as Brand<string, 'CommandHubPartitionKey'>,
    sk: withBrandValue(String((parsed as { SK?: string }).SK ?? 'unknown')) as Brand<string, 'CommandHubSortKey'>,
    type: (parsed as { Type?: CommandHubRecord['type'] }).Type ?? 'artifact',
    payload: (payload as Record<string, unknown>) ?? {},
  };
};

export const mapPatchToChanges = (value: unknown): { contractId: Brand<string, 'ExecutionContractId'> } & {
  commandPatch: Record<string, unknown>;
  updatedContract: ExecutionContract;
  changedFields: readonly string[];
} => {
  const parsed = z
    .object({
      contractId: z.string(),
      commandPatch: z.record(z.unknown()),
      changedFields: z.array(z.string()),
    })
    .parse(value);

  return {
    contractId: parsed.contractId as Brand<string, 'ExecutionContractId'>,
    commandPatch: parsed.commandPatch,
    updatedContract: {
      contractId: parsed.contractId as Brand<string, 'ExecutionContractId'>,
      tenant: withBrandValue('global') as Brand<string, 'TenantId'>,
      command: parsed.commandPatch as unknown as ExecutionContract['command'],
      intent: {
        intentId: withBrandValue(`${parsed.contractId}:intent`) as Brand<string, 'ExecutionIntentId'>,
        commandId: withBrandValue('missing') as Brand<string, 'CommandArtifactId'>,
        state: 'initialized',
        targetState: 'succeeded',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
      retries: {
        max: 3,
        used: 0,
      },
    },
    changedFields: parsed.changedFields,
  };
};
