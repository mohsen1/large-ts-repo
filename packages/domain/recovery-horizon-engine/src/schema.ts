import { z } from 'zod';
import type {
  HorizonInput,
  HorizonSignal,
  HorizonPlan,
  PluginContract,
  PluginConfig,
  PluginStage,
  StageLabel,
  PlanId,
  RunId,
  TimeMs,
  JsonLike,
  Milliseconds,
  IsoDatetime,
  PluginHandle,
} from './types.js';

const pluginStages = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const;
const pluginStageSchema = z.enum(pluginStages);

const toPlanId = (value: string): PlanId => value as PlanId;
const toRunId = (value: string): RunId => value as RunId;
const toTimeMs = (value: number): TimeMs => value as TimeMs;
const toMsNumber = (value: number): Milliseconds<number> => value as Milliseconds<number>;
const toDateTime = (value: string): IsoDatetime => value as IsoDatetime;

const parseMetadata = (value: unknown): Record<string, JsonLike> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, JsonLike>;
  }
  return {};
};

export const horizonInputSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    runId: z.string(),
    tenantId: z.string().min(3).max(120),
    stage: pluginStageSchema,
    tags: z.array(z.string().min(1).max(60)),
    metadata: z.record(z.unknown()),
  })
  .transform((value: any): HorizonInput<PluginStage> => ({
    version: value.version,
    runId: toRunId(value.runId),
    tenantId: value.tenantId,
    stage: value.stage,
    tags: value.tags,
    metadata: parseMetadata(value.metadata),
  }));

const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const horizonSignalSchema = z
  .object({
    id: z.string(),
    kind: pluginStageSchema,
    payload: z.unknown(),
    input: horizonInputSchema,
    severity: severitySchema,
    startedAt: z.string(),
    expiresAt: z.number().nonnegative().optional(),
  })
  .transform((value: any): HorizonSignal<PluginStage, JsonLike> => ({
    id: toPlanId(value.id),
    kind: value.kind,
    payload: value.payload,
    input: value.input,
    severity: value.severity,
    startedAt: toDateTime(value.startedAt),
    expiresAt: value.expiresAt === undefined ? undefined : toTimeMs(value.expiresAt),
  }));

const capabilitySchema = z.object({
  key: z.string(),
  description: z.string(),
  configSchema: z.record(z.unknown()),
});

const pluginConfigSchema = <K extends PluginStage>(kind: K) =>
  z
    .object({
      pluginKind: z.literal(kind),
      payload: z.unknown(),
      retryWindowMs: z.number().nonnegative().int(),
    })
    .transform((value: any): PluginConfig<K, JsonLike> => ({
      pluginKind: value.pluginKind,
      payload: value.payload,
      retryWindowMs: toMsNumber(value.retryWindowMs),
    }));

export const horizonContractSchema = <K extends PluginStage>(kind: K) =>
  z
    .object({
      kind: z.literal(kind),
      id: z.string().min(3).max(96),
      capabilities: z.array(capabilitySchema),
      defaults: pluginConfigSchema(kind),
      execute: z.unknown(),
    })
    .transform((value: any): PluginContract<K, PluginConfig<K, JsonLike>, JsonLike> => ({
      kind: value.kind,
      id: value.id as unknown as PluginContract<K, PluginConfig<K, JsonLike>, JsonLike>['id'],
      capabilities: value.capabilities,
      defaults: value.defaults,
      execute: value.execute as PluginHandle<K, JsonLike>,
    }));

export const horizonPlanSchema = z
  .object({
    id: z.string(),
    tenantId: z.string().min(3),
    startedAt: z.number().nonnegative(),
    pluginSpan: z.object({
      stage: pluginStageSchema,
      label: z.string(),
      startedAt: z.number().nonnegative(),
      durationMs: z.number().nonnegative().optional(),
    }),
    payload: z.unknown().optional(),
  })
  .transform((value: any): HorizonPlan => ({
    id: toPlanId(value.id),
    tenantId: value.tenantId,
    startedAt: toTimeMs(value.startedAt),
    pluginSpan: {
      stage: value.pluginSpan.stage,
      label: `${value.pluginSpan.stage.toUpperCase()}_STAGE` as StageLabel<PluginStage>,
      startedAt: toTimeMs(value.pluginSpan.startedAt),
      durationMs: value.pluginSpan.durationMs === undefined ? undefined : toMsNumber(value.pluginSpan.durationMs),
    },
    payload: value.payload,
  }));

export type HorizonInputJson = z.infer<typeof horizonInputSchema>;
export type HorizonSignalJson = z.infer<typeof horizonSignalSchema>;
export type HorizonEnvelopeJson<T extends PluginStage> = {
  readonly id: string;
  readonly kind: T;
  readonly payload: JsonLike;
};
export type HorizonPlanJson = z.infer<typeof horizonPlanSchema>;

export const parseHorizonInput = (value: unknown): HorizonInput<PluginStage> =>
  horizonInputSchema.parse(value) as HorizonInput<PluginStage>;

export const parseHorizonSignal = (value: unknown): HorizonSignal<PluginStage, JsonLike> =>
  horizonSignalSchema.parse(value) as HorizonSignal<PluginStage, JsonLike>;

export const parseHorizonPlan = (value: unknown): HorizonPlan =>
  horizonPlanSchema.parse(value) as HorizonPlan;
