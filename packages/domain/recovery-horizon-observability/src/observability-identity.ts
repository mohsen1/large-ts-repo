import { z } from 'zod';
import type { Brand } from '@shared/type-level';
import type {
  HorizonSignal,
  HorizonPlan,
  PluginStage,
  JsonLike,
  TimeMs,
  RunId,
} from '@domain/recovery-horizon-engine';

const stageValues = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const;
const severityValues = ['low', 'medium', 'high', 'critical'] as const;

export type ObservatoryTenant = Brand<string, 'ObservatoryTenant'>;
export type ObservatoryPlanId = Brand<string, 'ObservatoryPlanId'>;
export type ObservatoryMetricId = Brand<string, 'ObservatoryMetricId'>;
export type ObservatoryWindowId = Brand<string, 'ObservatoryWindowId'>;

export type ObservatorySeverity = (typeof severityValues)[number];
export type ObservatoryStage = (typeof stageValues)[number];
export type ObservatoryStageRoute = `${Lowercase<ObservatoryStage>}/${number}`;
export type ObservatoryWindowKey = `${ObservatoryTenant}:${ObservatoryStageRoute}:${number}`;
export type ObservatoryFingerprint = `${ObservatoryTenant}/${ObservatoryStage}/${string}`;

export type StageEventPayload<T extends ObservatoryStage> = {
  readonly stage: T;
  readonly tenant: ObservatoryTenant;
  readonly metadata: Record<string, JsonLike>;
};

export type EnvelopeTrace<TStage extends ObservatoryStage> = {
  readonly kind: `${TStage}:trace`;
  readonly stages: readonly TStage[];
};

export type FlattenedEvent<TPayload> = TPayload extends readonly [infer Head, ...infer Rest]
  ? readonly [Head, ...FlattenedEvent<Rest>]
  : [];

export type MapKeysByNamespace<T> = {
  [K in keyof T & string as `${K & string}::${string & keyof T & string}`]: T[K];
};

export interface ObservatoryEnvelope<
  TStage extends ObservatoryStage = ObservatoryStage,
  TPayload = JsonLike,
> {
  readonly tenantId: ObservatoryTenant;
  readonly runId: RunId;
  readonly stage: TStage;
  readonly at: TimeMs;
  readonly payload: TPayload;
  readonly severity: ObservatorySeverity;
}

export interface ObservatorySignalManifest<
  TStage extends ObservatoryStage = ObservatoryStage,
> {
  readonly tenantId: ObservatoryTenant;
  readonly stage: TStage;
  readonly fingerprint: ObservatoryFingerprint;
  readonly windowId: ObservatoryWindowId;
  readonly metricId: ObservatoryMetricId;
  readonly planId: ObservatoryPlanId;
}

export interface ObservatorySignalRecord<
  TStage extends ObservatoryStage = ObservatoryStage,
  TPayload = JsonLike,
> extends ObservatoryEnvelope<TStage, TPayload> {
  readonly manifest: ObservatorySignalManifest<TStage>;
}

export const stageSchema = z.enum(stageValues);
export const severitySchema = z.enum(severityValues);

export const observatorySignalSchema = z.object({
  tenantId: z.string().min(1),
  runId: z.string(),
  stage: stageSchema,
  at: z.number().int().nonnegative(),
  payload: z.record(z.unknown()).default({}),
  severity: severitySchema,
  fingerprint: z.string().min(1),
  windowId: z.string().min(4),
  metricId: z.string().min(4),
  planId: z.string().min(4),
  pluginStage: z.string().min(1).optional(),
});

export const observatoryWindowSchema = z.object({
  tenantId: z.string().min(1),
  windowId: z.string().min(4),
  stageWindow: z.array(stageSchema).nonempty(),
  windowMs: z.number().int().positive(),
  profile: z.string().min(1),
});

type ParsedRecord = z.infer<typeof observatorySignalSchema>;
type ParsedWindow = z.infer<typeof observatoryWindowSchema>;

export type ParsedObservatorySignal = ParsedRecord & ObservatorySignalManifest & {
  readonly manifest: ObservatorySignalManifest;
  readonly pluginStage?: string;
};
export type ParsedObservatoryWindow = ParsedWindow & {
  readonly resolvedWindow: ObservatoryWindowId;
};

const toTenant = (tenantId: string): ObservatoryTenant => tenantId as ObservatoryTenant;
const toWindowId = (tenantId: string, stamp: string | number): ObservatoryWindowId =>
  (`${tenantId}:${stamp}` as ObservatoryWindowId);
const toMetricId = (tenantId: string, index: number): ObservatoryMetricId =>
  (`${tenantId}:metric:${index}` as ObservatoryMetricId);
const toPlanId = (tenantId: string, stage: ObservatoryStage, stamp: number): ObservatoryPlanId =>
  (`${tenantId}:${stage}:${stamp}` as ObservatoryPlanId);

export const toObservabilityFingerprint = <
  TStage extends ObservatoryStage,
  TPrefix extends string,
>(
  tenantId: string,
  stage: TStage,
  prefix: TPrefix,
): ObservatoryFingerprint => `${toTenant(tenantId)}/${stage}/${prefix}` as ObservatoryFingerprint;

export const parseObservatorySignal = (input: unknown): ParsedObservatorySignal => {
  const parsed = observatorySignalSchema.parse(input);
  return {
    tenantId: toTenant(parsed.tenantId),
    runId: parsed.runId as RunId,
    stage: parsed.stage as ObservatoryStage,
    at: parsed.at as TimeMs,
    payload: parsed.payload as Record<string, unknown>,
    severity: parsed.severity,
    fingerprint: toObservabilityFingerprint(parsed.tenantId, parsed.stage as ObservatoryStage, parsed.windowId),
    windowId: toWindowId(parsed.tenantId, parsed.windowId),
    metricId: toMetricId(parsed.tenantId, parsed.windowId.length),
    planId: toPlanId(parsed.tenantId, parsed.stage as ObservatoryStage, parsed.at),
    pluginStage: parsed.pluginStage as string | undefined,
    manifest: {
      tenantId: toTenant(parsed.tenantId),
      stage: parsed.stage as ObservatoryStage,
      fingerprint: toObservabilityFingerprint(parsed.tenantId, parsed.stage as ObservatoryStage, parsed.windowId),
      windowId: toWindowId(parsed.tenantId, parsed.windowId),
      metricId: toMetricId(parsed.tenantId, parsed.windowId.length),
      planId: toPlanId(parsed.tenantId, parsed.stage as ObservatoryStage, parsed.at),
    },
  };
};

export const parseObservatoryWindow = (input: unknown): ParsedObservatoryWindow => {
  const parsed = observatoryWindowSchema.parse(input);
  return {
    tenantId: toTenant(parsed.tenantId),
    windowId: toWindowId(parsed.tenantId, parsed.windowId),
    stageWindow: [...parsed.stageWindow] as typeof parsed.stageWindow,
    windowMs: parsed.windowMs as TimeMs,
    profile: parsed.profile,
    resolvedWindow: toWindowId(parsed.tenantId, parsed.windowId),
  };
};

export const collectStagesFromSignals = <TSignals extends readonly ObservatorySignalRecord[]>(
  signals: TSignals,
): readonly TSignals[number]['stage'][] =>
  signals.map((signal) => signal.stage);

export const distinctStages = <T extends readonly ObservatoryStage[]>(
  stages: T,
): readonly T[number][] => {
  const discovered = new Set<ObservatoryStage>();
  const ordered = [] as ObservatoryStage[];
  for (const stage of stages) {
    if (!discovered.has(stage)) {
      discovered.add(stage);
      ordered.push(stage);
    }
  }
  return ordered;
};

export type StageCoverage<TSignals extends readonly ObservatorySignalRecord[]> = {
  [S in TSignals[number]['stage']]: readonly Extract<TSignals[number], { stage: S }>[];
};

export const groupSignalsByStage = <TSignals extends readonly ObservatorySignalRecord[]>(
  signals: TSignals,
): StageCoverage<TSignals> => {
  const buckets = {} as Record<ObservatoryStage, ObservatorySignalRecord[]>;
  for (const signal of signals) {
    const bucket = buckets[signal.stage] ?? [];
    bucket.push(signal);
    buckets[signal.stage] = bucket;
  }
  return buckets as unknown as StageCoverage<TSignals>;
};

export const toTimelineWindowId = (tenantId: string, runId: RunId, stage: ObservatoryStage): ObservatoryWindowId =>
  toWindowId(tenantId, `${runId}:${stage}`);

export const describeWindow = <const TRoute extends readonly string[]>(route: TRoute): ObservatoryWindowKey =>
  `${'tenant-all'}:${route.join(':') as string}:v${route.length}` as ObservatoryWindowKey;
