import { Brand, NoInfer, DeepReadonly, Merge, RecursivePath } from '@shared/type-level';

export type MeshZone = 'edge' | 'core' | 'silo' | 'vault' | 'external' | 'zone-east' | 'zone-west' | 'zone-core';
export type MeshChannel = 'ingest' | 'analysis' | 'dispatch' | 'repair' | 'verification';
export type MeshPhase = `${MeshChannel}:${MeshZone}`;

export type MeshTraceId = Brand<string, 'mesh-trace-id'>;
export type MeshRunId = Brand<string, 'mesh-run'>;
export type MeshStepId = Brand<string, 'mesh-step'>;
export type MeshWorkflowId = Brand<string, 'mesh-workflow'>;

export interface MeshMeta {
  readonly runId: MeshRunId;
  readonly owner: string;
  readonly zone: MeshZone;
  readonly startedAt: number;
  readonly tags: readonly string[];
}

export interface MeshPayloadShape {
  readonly entityId: string;
  readonly zone: MeshZone;
  readonly score: number;
  readonly severity: 0 | 1 | 2 | 3 | 4 | 5;
  readonly metrics?: Record<string, number>;
}

export type MeshRoute = `mesh.${string}` | `${MeshChannel}.${MeshZone}`;
export type MeshPath = RecursivePath<MeshPayloadShape> | never;

export interface MeshEnvelope<TPayload extends MeshPayloadShape = MeshPayloadShape> {
  readonly id: MeshRunId;
  readonly route: MeshRoute;
  readonly payload: TPayload;
  readonly trace: MeshMeta;
}

export type MeshEnvelopeMap<T> = {
  readonly [P in MeshChannel]: { route: MeshRoute; value: T };
};

export type RenameKeys<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T & string as K extends `${Prefix}${infer Rest}` ? Rest : K]: T[K];
};

export type MeshTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...MeshTuple<Tail>]
  : readonly [];

export type MeshTupleFilter<T extends readonly unknown[], TValue = never> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends TValue
    ? readonly [Head, ...MeshTupleFilter<Tail, TValue>]
    : MeshTupleFilter<Tail, TValue>
  : readonly [];

export type KeyForPath<T, K extends keyof T & string> = K extends `_${string}` ? never : K;

export interface MeshExecutionTrace {
  readonly traceId: MeshTraceId;
  readonly createdAt: number;
  readonly runId: MeshRunId;
  readonly steps: readonly MeshStepId[];
}

export interface MeshDispatchOptions {
  readonly owner: string;
  readonly target?: MeshZone;
  readonly priority: 'low' | 'normal' | 'high';
}

export interface MeshDispatchInput extends MeshExecutionTrace {
  readonly zone: MeshZone;
  readonly route: MeshRoute;
  readonly payloadCount: number;
  readonly options?: MeshDispatchOptions;
}

export interface MeshDispatchOutput<TOutput> {
  readonly ok: boolean;
  readonly output: TOutput;
  readonly trace: MeshExecutionTrace;
  readonly route: MeshRoute;
}

export const meshChannels = ['ingest', 'analysis', 'dispatch', 'repair', 'verification'] as const satisfies readonly MeshChannel[];
export const meshZones = ['edge', 'core', 'silo', 'vault', 'external', 'zone-east', 'zone-west', 'zone-core'] as const satisfies readonly MeshZone[];

export const createTraceId = (namespace: string): MeshTraceId => `${namespace}-${Date.now()}` as MeshTraceId;
export const createRunId = (namespace: string, zone: MeshZone): MeshRunId => `${namespace}-${zone}-${Date.now()}` as MeshRunId;
export const createStepId = (name: string, index: number): MeshStepId => `${name}-${index}` as MeshStepId;

export const pickRoute = (phase: MeshChannel, zone: MeshZone): MeshPhase => `${phase}:${zone}` as MeshPhase;

export const withNoInfer = <TValue, TMerge extends object>(
  value: TValue,
  merge: NoInfer<TMerge>,
): Merge<TValue, TMerge> => ({ ...value as object, ...merge as object }) as Merge<TValue, TMerge>;

export const mergeTrace = <T extends Record<string, unknown>, U extends Record<string, unknown>>(
  base: T,
  overlay: NoInfer<U>,
): Merge<T, U> => ({ ...base, ...overlay }) as Merge<T, U>;

export const sanitizePayload = <T extends MeshPayloadShape>(payload: DeepReadonly<T>): T => ({
  ...payload,
  score: Number(payload.score.toFixed(4)),
  severity: (payload.severity < 5 && payload.severity >= 0 ? payload.severity : 0) as T['severity'],
} as T);

export const routeSignature = <T extends MeshRoute>(route: T): `${T extends `${infer Channel}.${infer Zone}` ? `${Channel}-${Zone}` : 'mesh'}` => {
  const [channel, zone] = route.split('.') as [string, string | undefined];
  const safeZone = zone ?? 'route';
  return `${channel}-${safeZone}` as `${T extends `${infer C}.${infer Z}` ? `${C}-${Z}` : 'mesh'}`;
};
