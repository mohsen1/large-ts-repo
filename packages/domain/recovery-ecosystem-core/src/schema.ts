import { z } from 'zod';
import type { JsonObject, JsonValue } from '@shared/type-level';
import {
  asPolicyId,
  asRunId,
  asTenantId,
  type EventKind,
  type NamespaceTag,
  type RunId,
  type StageId,
  type TenantId,
} from './identifiers';
import type {
  EcosystemPlan,
  EcosystemMetric,
  LifecyclePhase,
  EventEnvelope,
  PluginRunRecord,
  PolicyMode,
  RecoveryRun,
  RunSummary,
  StageSnapshot,
} from './models';

const Namespace = z.string().trim().min(3).transform((value: string): NamespaceTag => `namespace:${value}` as NamespaceTag);
const Tenant = z
  .string()
  .trim()
  .min(1)
  .transform((value: string): TenantId => asTenantId(value));
const Run = z.string().trim().min(1).transform((value: string): RunId => asRunId(value));
const PolicyModeSchema: z.ZodType<PolicyMode> = z.union([
  z.literal('advisory'),
  z.literal('mandatory'),
  z.literal('quarantine'),
  z.literal('fail-open'),
]);
const StageStatus = z.union([
  z.literal('queued'),
  z.literal('preflight'),
  z.literal('running'),
  z.literal('rollback'),
  z.literal('completed'),
  z.literal('aborted'),
]);

const StageMetric = z.object({
  name: z.string().trim().startsWith('metric:'),
  value: z.number().finite(),
  unit: z.string().trim().min(1),
  labels: z.record(z.string(), z.string()),
});

const StageSnapshotSchema = z.object({
  id: z.string().startsWith('stage:'),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  status: StageStatus,
  metrics: z.array(StageMetric),
  payload: z.record(z.string(), z.unknown()),
  runId: Run,
  tenant: Tenant,
  commandId: z.string(),
});

const PluginRunSchema = z.object({
  plugin: z.string().startsWith('plugin:'),
  namespace: Namespace,
  stage: z.string().startsWith('stage:'),
  startedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  output: z.record(z.string(), z.unknown()),
  succeeded: z.boolean(),
  details: z.array(z.string().trim()),
});

const StageConfig = z.object({
  id: z.string().startsWith('stage:'),
  name: z.string().trim().min(1),
  plugin: z.string().startsWith('plugin:'),
  dependsOn: z.array(z.string().startsWith('stage:')),
  severity: z.union([z.literal('info'), z.literal('warn'), z.literal('degrade'), z.literal('critical')]),
  timeoutMs: z.number().positive(),
  retries: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  tags: z.array(z.string().trim()),
});

const PlanEnvelope = z.object({
  id: z.string().startsWith('plan:'),
  tenant: Tenant,
  namespace: Namespace,
  name: z.string().trim(),
  phases: z.array(StageConfig),
  maxConcurrency: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(8)]),
  policyIds: z
    .array(z.string())
    .min(1)
    .transform((value) => value.map((entry: string) => asPolicyId(entry))),
});

const StageSnapshotMap = z.array(StageSnapshotSchema);

export const RunSummarySchema = z.object({
  runId: Run,
  tenant: Tenant,
  namespace: Namespace,
  status: StageStatus,
  score: z.number().min(0).max(100),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  stages: StageSnapshotMap,
});

const RunEnvelope = z.object({
  id: Run,
  tenant: Tenant,
  namespace: Namespace,
  phase: StageStatus,
  policyMode: PolicyModeSchema,
  plan: PlanEnvelope,
  snapshots: StageSnapshotMap,
  records: z.array(PluginRunSchema),
  warnings: z.array(z.string().trim()),
});

const EventEnvelopeSchema = z.object({
  kind: z.string().startsWith('event:'),
  namespace: Namespace,
  at: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});

type EventEnvelopeView<TPayload extends Record<string, JsonValue>, TNamespace extends string = string> = {
  readonly kind: EventKind<string>;
  readonly namespace: NamespaceTag<TNamespace>;
  readonly at: string;
  readonly payload: TPayload;
};

export const parsePlan = (value: unknown): EcosystemPlan => PlanEnvelope.parse(value) as unknown as EcosystemPlan;
export const parseSummary = (value: unknown): RunSummary => RunSummarySchema.parse(value) as unknown as RunSummary;
export const parseRun = (value: unknown): RecoveryRun => RunEnvelope.parse(value) as unknown as RecoveryRun;

export const parseMetric = (value: unknown): EcosystemMetric => {
  const payload = StageMetric.parse(value) as unknown;
  return payload as EcosystemMetric;
};

export const parseDependency = (value: unknown): {
  readonly from: StageId;
  readonly to: StageId;
  readonly reason: string;
  readonly weight: number;
} => {
  const stage = z
    .object({
      from: z.string().startsWith('stage:'),
      to: z.string().startsWith('stage:'),
      reason: z.string().trim(),
      weight: z.number().nonnegative(),
    })
    .parse(value) as { readonly from: string; readonly to: string; readonly reason: string; readonly weight: number };
  return {
    ...stage,
    from: `stage:${stage.from.replace(/^stage:/, '')}` as StageId,
    to: `stage:${stage.to.replace(/^stage:/, '')}` as StageId,
  };
};

export const parsePluginRecords = (value: unknown): readonly PluginRunRecord[] =>
  z.array(PluginRunSchema).parse(value) as unknown as readonly PluginRunRecord[];

export const parseRunPayload = (value: unknown): JsonObject => {
  const payload = z.record(z.string(), z.unknown()).parse(value) as JsonObject;
  return payload;
};

export const parseEventEnvelope = (value: unknown): EventEnvelope<JsonObject> =>
  EventEnvelopeSchema.parse(value) as unknown as EventEnvelope<JsonObject>;

export const defaultRunPhase = 'queued' as const satisfies LifecyclePhase;
export const defaultPolicyMode = 'mandatory' as const satisfies PolicyMode;

export const parseStageSnapshots = (value: unknown): readonly StageSnapshot[] =>
  StageSnapshotMap.parse(value) as unknown as readonly StageSnapshot[];
