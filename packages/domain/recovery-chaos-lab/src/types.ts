import { z } from 'zod';
import { Brand, PathValue } from '@shared/type-level';

export type ChaosBrand<T extends string> = Brand<string, T>;
export type EntityId = ChaosBrand<'ChaosEntityId'>;
export type ChaosNamespace = ChaosBrand<'ChaosNamespace'>;
export type ScenarioId = ChaosBrand<'ScenarioId'>;
export type RunId = ChaosBrand<'RunId'>;
export type PluginName = ChaosBrand<'ChaosPluginName'>;

export type ChaosMetricWindowUnit = 's' | 'm' | 'h' | 'd';
export type ChaosWindow<TUnit extends ChaosMetricWindowUnit = ChaosMetricWindowUnit> = `${number}${TUnit}`;
export type ChaosMetricWindow = ChaosWindow;
export type ChaosTier = 'control' | 'observed' | 'targeted' | 'blast';
export type ChaosStatus = 'idle' | 'arming' | 'active' | 'verified' | 'healing' | 'complete' | 'failed';
export type ChaosTag = `${ChaosTier}:${Lowercase<ChaosStatus>}`;

export type NodeLabel<Prefix extends string = ''> = Prefix extends '' ? `${string}-node` : `${Prefix}.${string}-node`;
export type RecursiveTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...RecursiveTuple<Tail>]
  : readonly [];
export type PromiseMaybe<T> = Promise<T> | T;

export type PluginShape<
  Name extends string = string,
  P = unknown,
  O = unknown,
  Meta extends Record<string, unknown> = {}
> = {
  readonly name: Name;
  readonly version: `${number}.${number}.${number}`;
  readonly metadata: Meta;
  readonly input: P;
  readonly output: O;
};

export type ActionKind = 'latency' | 'packet-loss' | 'throttle' | 'node-drain' | 'chaos-stop';

export type ChaosEventValue<T extends string = string> = `${T}::${Uppercase<T>}`;
export type ChaosEventMap<T extends Record<string, unknown>> = {
  [K in keyof T & string as ChaosEventValue<K>]: T[K];
};

export type UnwrapMessage<T> = T extends { message: infer M; ok: boolean } ? M : never;
export type SelectPayload<T> = T extends { payload: infer P } ? P : never;

export type InferInput<T> = T extends PluginShape<string, infer I, unknown> ? I : never;
export type InferOutput<T> = T extends PluginShape<string, any, infer O> ? O : never;

export interface StageBoundary<
  Name extends string = string,
  TInput = unknown,
  TOutput = unknown,
  Meta extends Record<string, unknown> = {}
> {
  readonly name: Name;
  readonly version: `${number}.${number}.${number}`;
  readonly metadata: Meta;
  readonly input: TInput;
  readonly output: TOutput;
  readonly dependsOn?: readonly string[];
  readonly weight?: number;
}

export type ScenarioStep<Name extends string = string, P = unknown> = {
  readonly key: `${Name}:${string}`;
  readonly plugin: PluginName;
  readonly payload: P;
  readonly weight?: number;
  readonly dependsOn?: readonly string[];
};

export type ExtractStepPayload<T extends readonly ScenarioStep[]> = {
  [K in keyof T]: T[K] extends ScenarioStep<infer Name, infer Payload> ? { [P in Name]: Payload } : never;
}[number];

export type StepGraph<T extends readonly ScenarioStep<string, unknown>[]> = {
  [K in T[number]['key']]: T[number] & { readonly step: K };
};

export type StepPayloadByKey<
  T extends readonly ScenarioStep<string, unknown>[],
  K extends T[number]['key']
> = Extract<T[number], { key: K }>['payload'];

export type RemappedStepState<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `${K}State` : never]: {
    value: T[K];
    updatedAt: ISODate;
  };
};

export type ISODate = Brand<string, 'ISODate'>;
export type EpochMs = Brand<number, 'EpochMs'>;
export type Percent = Brand<number, 'Percent'> & { readonly __max: 100 };
export type BoundedPercent<T extends number> = `${T}%` extends `${infer N extends number}%` ? N & Percent : never;

export interface Tagged<T, TTag extends string> {
  readonly kind: TTag;
  readonly value: T;
}

export type TaggedUnion<T extends readonly string[]> = T extends readonly [infer Head extends string, ...infer Tail extends string[]]
  ? Tagged<Head, Head> | TaggedUnion<Tail>
  : never;

export type ChaosMetric<K extends string, V = number> = Record<K, { readonly value: V; readonly sampledAt: EpochMs }>;
export type TimelineEvent<Value = unknown> = { readonly at: EpochMs; readonly value: Value; readonly source: string };
export type Flatten<T> = T extends readonly (infer U)[] ? U : T;

export type DeepPickByValue<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: T[K];
};

export type ValuePathSelector<T, TPath extends string> = {
  [K in keyof T]: T[K] extends object
    ? {
        [P in `${K & string}.${TPath}`]: PathValue<T, `${K & string}.${TPath}`>;
      }
    : never;
}[keyof T];

export const ChaosIdentifier = z.string().brand<'ChaosIdentifier'>();
export const ChaosNamespaceSchema = z.string().max(64).brand<'ChaosNamespace'>();
export const ScenarioIdSchema = z.string().uuid().brand<'ScenarioId'>();
export const RunIdSchema = z.string().uuid().brand<'RunId'>();
export const PluginNameSchema = z.string().min(3).max(64).brand<'ChaosPluginName'>();

export type ChaosStepConfig = {
  readonly namespace: ChaosNamespace;
  readonly scenarioId: ScenarioId;
  readonly runId: RunId;
  readonly status: ChaosStatus;
  readonly startedAt?: EpochMs;
  readonly finishedAt?: EpochMs;
  readonly tags?: readonly ChaosTag[];
};

export const ChaosStepConfigSchema = z.object({
  namespace: ChaosNamespaceSchema,
  scenarioId: ScenarioIdSchema,
  runId: RunIdSchema,
  status: z.enum(['idle', 'arming', 'active', 'verified', 'healing', 'complete', 'failed']),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  tags: z.array(z.string()).optional()
});

export function asEntityId<T extends string>(id: T): EntityId {
  return id as unknown as EntityId;
}

export function asRunId<T extends string>(id: T): RunId {
  return id as unknown as RunId;
}

export function asScenarioId<T extends string>(id: T): ScenarioId {
  return id as unknown as ScenarioId;
}

export function asNamespace<T extends string>(name: T): ChaosNamespace {
  return name as unknown as ChaosNamespace;
}

export function toEpochMs(date: Date): EpochMs {
  return date.getTime() as unknown as EpochMs;
}

export function stamp(value: string): ISODate {
  return `${value}` as unknown as ISODate;
}

export type EventEnvelope<T extends ChaosEventMap<Record<string, unknown>>> = {
  readonly eventId: EntityId;
  readonly occurredAt: EpochMs;
  readonly payloads: Readonly<T>;
};

export type StageInputs<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  [K in T[number] as K['name']]:
    K extends StageBoundary<K['name'], infer Input, unknown> ? Input : never;
};

export type StageOutputs<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  [K in T[number] as K['name']]:
    K extends StageBoundary<K['name'], unknown, infer Output> ? Output : never;
};

export interface ChaosCatalogEntry {
  readonly namespace: ChaosNamespace;
  readonly scenarioId: ScenarioId;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly ChaosTag[];
  readonly status: ChaosStatus;
  readonly createdAt: EpochMs;
}

export interface ChaosScenarioDefinition {
  readonly namespace: ChaosNamespace;
  readonly id: ScenarioId;
  readonly title: string;
  readonly version: `${number}.${number}.${number}`;
  readonly stages: readonly StageBoundary<string, unknown, unknown>[];
  readonly createdAt: EpochMs;
}

export interface ChaosRunSnapshot {
  readonly runId: RunId;
  readonly namespace: ChaosNamespace;
  readonly scenarioId: ScenarioId;
  readonly status: ChaosStatus;
  readonly progress: number;
  readonly metrics: Record<`${string}::ratio`, number>;
}

export type SnapshotIndex<S extends ChaosRunSnapshot> = {
  [K in keyof S as `snapshot:${K & string}`]: S[K];
};

export type StageMap<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  [K in T[number] as K['name']]: K;
};

export type TopologyEdge = { readonly from: string; readonly to: string; readonly weight: number };
export type TopologyMatrix<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  readonly entries: ReadonlyArray<TopologyEdge>;
  readonly outDegrees: Record<T[number]['name'], number>;
  readonly isolated: readonly T[number]['name'][];
};

export function buildTopology<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  stages: T
): TopologyMatrix<T> {
  const entries: TopologyEdge[] = [];
  const outDegrees = {} as Record<T[number]['name'], number>;

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const dependencies = stage.dependsOn ?? stages.slice(0, index).map((item) => item.name);
    outDegrees[stage.name as T[number]['name']] = dependencies.length;

    for (const dependency of dependencies) {
      entries.push({ from: dependency, to: stage.name, weight: (dependencies.length || 1) / stages.length });
    }
  }

  const nodeSet = new Set(stages.map((stage) => stage.name));
  const isolated = [...nodeSet].filter((node) => !entries.some((entry) => entry.to === node)) as readonly T[number]['name'][];

  return {
    entries: entries as ReadonlyArray<TopologyEdge>,
    outDegrees,
    isolated
  };
}
