import { z } from 'zod';
import { type Brand, type PageResult } from '@shared/core';

export type Timestamp = string;

export type NonEmpty<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R] ? readonly [H, ...R] : never;

export type PlaybookAutomationSessionId = Brand<string, 'PlaybookAutomationSessionId'>;
export type PlaybookAutomationRunId = Brand<string, 'PlaybookAutomationRunId'>;
export type PlaybookAutomationPluginId = Brand<string, 'PlaybookAutomationPluginId'>;
export type PlaybookAutomationArtifactId = Brand<string, 'PlaybookAutomationArtifactId'>;
export type StageId = Brand<string, 'PlaybookAutomationStageId'>;

export type PlaybookPhase =
  | 'initialized'
  | 'enqueued'
  | 'simulated'
  | 'executing'
  | 'audited'
  | 'finished';

export type SeverityBand = 'p0' | 'p1' | 'p2' | 'p3';

export type TenantAware<T> = T & { tenantId: string };

export interface PlaybookConstraint<TRaw = unknown> {
  dimension: string;
  threshold: number;
  operator: 'gte' | 'lte' | 'eq' | 'in' | 'regex';
  raw?: TRaw;
}

export interface PolicySignal {
  source: string;
  metric: string;
  value: number;
  severity: SeverityBand;
  timestamp: Timestamp;
}

export interface StagePlan<
  TKind extends string = 'action' | 'gate' | 'notification',
  TInput = unknown,
  TOutput = unknown,
> {
  readonly id: StageId;
  readonly name: string;
  readonly kind: TKind;
  readonly weight: number;
  readonly timeoutMinutes: number;
  readonly constraints: readonly PlaybookConstraint<TInput>[];
  readonly outputTransform: {
    readonly kind: TKind;
    readonly inputProjection?: NoInfer<TInput>;
    readonly outputProjection?: NoInfer<TOutput>;
  };
  readonly metadata: Record<string, string>;
}

export type StageKind<T extends StagePlan> = T['kind'];

export interface BlueprintTemplate<TContext = Record<string, unknown>, TSignal extends string = string> {
  readonly id: PlaybookAutomationArtifactId;
  readonly title: string;
  readonly region: string;
  readonly playbook: string;
  readonly tags: readonly string[];
  readonly owner: string;
  readonly labels: readonly TSignal[];
  readonly context: TenantAware<TContext>;
  readonly constraints: readonly PlaybookConstraint[];
  readonly steps: readonly StagePlan[];
  readonly createdAt: Timestamp;
  readonly version: `${number}.${number}.${number}`;
}

export type RecursiveTuple<T, MaxDepth extends number = 12, Prefix extends readonly unknown[] = []> =
  Prefix['length'] extends MaxDepth ? readonly [...Prefix] : [T, ...Prefix] | [];

export type TupleConcat<A extends readonly unknown[], B extends readonly unknown[]> = [...A, ...B];

export type BrandTemplate<T extends string, B extends string> = `${T}::${B}`;

export type RoutedChannel<T extends string> = `channel:${T}`;

export type EventDescriptor<TName extends string> = {
  readonly name: BrandTemplate<TName, 'playbook-automation-event'>;
  readonly namespace: BrandTemplate<TName, 'namespace'>;
};

export interface RuntimeEnvelope<TPayload = unknown> {
  readonly kind: `${PlaybookPhase}:${string}`;
  readonly runId: PlaybookAutomationRunId;
  readonly payload: TPayload;
  readonly createdAt: Timestamp;
}

export interface StageResult<TPayload = unknown> {
  readonly id: StageId;
  readonly status: 'ok' | 'warn' | 'fail';
  readonly startedAt: Timestamp;
  readonly durationMs: number;
  readonly payload: TPayload;
}

export interface AutomationPlan<TContext = Record<string, unknown>> {
  readonly id: PlaybookAutomationRunId;
  readonly tenantId: string;
  readonly title: string;
  readonly phases: readonly PlaybookPhase[];
  readonly template: BlueprintTemplate<TContext>;
  readonly staged: readonly StagePlan[];
  readonly constraints: readonly PlaybookConstraint[];
  readonly expectedLatencyMinutes: number;
  readonly riskScore: number;
}

export interface PlanResult<TSummary = string> {
  readonly planId: PlaybookAutomationRunId;
  readonly runId: PlaybookAutomationRunId;
  readonly status: 'queued' | 'running' | 'failed' | 'success';
  readonly score: number;
  readonly warnings: readonly TSummary[];
  readonly metadata: Record<string, string | number | boolean>;
}

export interface AdapterSnapshot {
  readonly id: PlaybookAutomationSessionId;
  readonly runIds: readonly PlaybookAutomationRunId[];
  readonly metrics: {
    readonly plans: number;
    readonly alerts: number;
    readonly failedPhases: number;
  };
}

export type RemapKeys<T> = {
  [K in keyof T as K extends string ? `metric:${K}` : never]: T[K];
};

export type InferConstraintKeys<T extends PlaybookConstraint> = T['dimension'];

export type AnyBlueprint<T> = BlueprintTemplate<T> | Brand<string, 'InvalidBlueprint'>;

export const severityOrder: NonEmpty<[SeverityBand, ...SeverityBand[]]> = ['p0', 'p1', 'p2', 'p3'];

export const PlaybookAutomationSessionSchema = z.object({
  id: z.string().brand<'PlaybookAutomationSessionId'>(),
  tenantId: z.string().min(1),
  status: z.enum(['initialized', 'enqueued', 'simulated', 'executing', 'audited', 'finished']),
  createdAt: z.string(),
  updatedAt: z.string(),
  labels: z.array(z.string()),
}).passthrough();

export const StagePlanSchema = z.object({
  id: z.string().brand<'PlaybookAutomationStageId'>(),
  name: z.string().min(1),
  kind: z.enum(['action', 'gate', 'notification']),
  weight: z.number().min(0).max(1),
  timeoutMinutes: z.number().min(1).max(240),
  constraints: z.array(
    z.object({
      dimension: z.string().min(1),
      threshold: z.number(),
      operator: z.enum(['gte', 'lte', 'eq', 'in', 'regex']),
      raw: z.unknown().optional(),
    }),
  ),
  outputTransform: z.object({
    kind: z.string(),
    inputProjection: z.unknown().optional(),
    outputProjection: z.unknown().optional(),
  }),
  metadata: z.record(z.string()),
});

export const BlueprintTemplateSchema = z.object({
  id: z.string().brand<'PlaybookAutomationArtifactId'>(),
  title: z.string().min(2),
  region: z.string().min(2),
  playbook: z.string().min(2),
  tags: z.array(z.string()),
  owner: z.string().min(2),
  labels: z.array(z.string()),
  context: z.record(z.unknown()),
  constraints: z.array(
    z.object({
      dimension: z.string(),
      threshold: z.number(),
      operator: z.enum(['gte', 'lte', 'eq', 'in', 'regex']),
      raw: z.unknown().optional(),
    }),
  ),
  steps: z.array(StagePlanSchema),
  createdAt: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});

export const PlanResultSchema = z.object({
  planId: z.string().brand<'PlaybookAutomationRunId'>(),
  runId: z.string().brand<'PlaybookAutomationRunId'>(),
  status: z.enum(['queued', 'running', 'failed', 'success']),
  score: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

export const policySignalFromTemplate = <TTemplate extends BlueprintTemplate>(
  template: TTemplate,
  severity: SeverityBand,
): PolicySignal => ({
  source: template.owner,
  metric: template.playbook,
  value: template.constraints.length,
  severity,
  timestamp: new Date().toISOString(),
});

export const createPhaseSequence = (seed: PlaybookPhase[]): readonly PlaybookPhase[] => {
  const seen = new Set<PlaybookPhase>();
  const out: PlaybookPhase[] = [];
  for (const phase of seed) {
    if (!seen.has(phase)) {
      seen.add(phase);
      out.push(phase);
    }
  }
  return out;
};

export const phaseSequence: readonly PlaybookPhase[] = createPhaseSequence([
  'initialized',
  'enqueued',
  'simulated',
  'executing',
  'audited',
  'finished',
]);

export const normalizeSession = <T extends { tenantId: string; labels?: readonly string[] }>(session: T) => ({
  ...session,
  labels: session.labels ?? [],
  tenantId: session.tenantId.trim(),
});

export type StagePlanByKind<
  T extends readonly StagePlan[],
  K extends StagePlan['kind'],
> = Extract<T[number], { kind: K }>;

export type StageOutputs<
  TStages extends readonly StagePlan[],
  _Acc extends Record<string, unknown> = {},
> = {
  [K in TStages[number]['kind'] as K]:
    NonEmpty<[
      ...RecursiveTuple<Brand<string, `result:${K}`>, 3>,
      string,
    ]>;
};

export type Pagination<T> = PageResult<T>;
