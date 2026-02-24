import type { Brand, JsonValue } from '@shared/type-level';
import type {
  HorizonTenant,
  HorizonSessionId,
  HorizonTraceId,
} from '@shared/horizon-lab-runtime';

export type Milliseconds<T extends number> = Brand<number, `ms:${T}`>;
export type TimeMs = Milliseconds<number>;
export type IsoDatetime = Brand<string, 'iso-datetime'>;
export type RunId = Brand<string, 'run-id'>;
export type PlanId = Brand<string, 'plan-id'>;

export type EpochMs = TimeMs | Milliseconds<number>;

export type PluginStage = 'ingest' | 'analyze' | 'resolve' | 'optimize' | 'execute';
export type StageLabel<S extends PluginStage> = `${Uppercase<S>}_STAGE`;

export type NonNullableRecord<T extends Record<string, unknown>> = {
  [K in keyof T]-?: Exclude<T[K], undefined>;
};

export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends Map<infer K, infer V>
      ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
      : T extends Set<infer V>
        ? ReadonlySet<DeepReadonly<V>>
        : T extends object
          ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
          : T;

export type MergeWithOverride<T, U> = Omit<T, keyof U> & U;

export type InferArrayElement<T> = T extends readonly (infer U)[] ? U : never;

export type Cartesian<T extends readonly unknown[]> =
  T extends []
    ? [never]
    : {
        [K in keyof T]: T[K] extends readonly (infer U)[] ? U : never;
      };

export type ZipTuples<A extends readonly unknown[], B extends readonly unknown[]> =
  A extends readonly [infer A0, ...infer AR]
    ? B extends readonly [infer B0, ...infer BR]
      ? [[A0, B0], ...ZipTuples<AR, BR>]
      : []
    : [];

export type ReverseTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Rest]
    ? [...ReverseTuple<Rest>, Head]
    : [];

export type Head<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]]
  ? H
  : never;

export type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest]
  ? Rest
  : [];

export type BuildRoute<T extends string> =
  T extends `${infer A}/${infer B}`
    ? B extends ''
      ? [A]
      : [A, ...BuildRoute<B>]
    : [T];

export type JoinRoute<T extends readonly string[], SEP extends string = '/'> =
  T extends readonly [infer H, ...infer R]
    ? H extends string
      ? R extends readonly string[]
        ? R extends []
          ? H
          : `${H}${SEP}${JoinRoute<R, SEP>}`
        : never
      : never
    : never;

export type KeyedByStage<T extends Record<string, any>> = {
  [K in keyof T as K extends PluginStage ? K : never]: T[K];
};

export type RenameKeys<T extends Record<string, any>, Prefix extends string> = {
  [K in keyof T & string as `${Prefix}.${K}`]: T[K];
};

export type JsonLike = JsonValue;

export interface HorizonInput<TKind extends string = string> {
  readonly version: string;
  readonly runId: RunId;
  readonly tenantId: string;
  readonly stage: TKind;
  readonly tags: readonly string[];
  readonly metadata: Record<string, JsonLike>;
}

export interface HorizonEnvelope<TKind extends string, TPayload = unknown> {
  readonly id: PlanId;
  readonly kind: TKind;
  readonly payload: TPayload;
  readonly input: HorizonInput<TKind>;
}

export interface HorizonSignal<TKind extends string = string, TPayload = unknown>
  extends HorizonEnvelope<TKind, TPayload> {
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly startedAt: IsoDatetime;
  readonly expiresAt?: TimeMs;
}

export interface StageSpan<T extends PluginStage> {
  readonly stage: T;
  readonly label: StageLabel<T>;
  readonly startedAt: TimeMs;
  readonly durationMs?: Milliseconds<number>;
}

export interface TypedPluginSpec {
  readonly id: string;
  readonly owner: string;
  readonly version: `${number}.${number}.${number}`;
}

export type PluginConfig<K extends string, TPayload> = {
  readonly pluginKind: K;
  readonly payload: TPayload;
  readonly retryWindowMs: Milliseconds<number>;
};

export type PluginHandle<TKind extends string, TPayload> =
  (input: ReadonlyArray<PluginConfig<TKind, TPayload>>, signal: AbortSignal) => Promise<ReadonlyArray<HorizonSignal<TKind>>>;

export type PluginCapability<K extends string = string> = {
  readonly key: K;
  readonly description: string;
  readonly configSchema: Record<string, unknown>;
};

export type PluginContract<
  TKind extends PluginStage,
  TConfig extends PluginConfig<TKind, unknown>,
  TPayload,
> = {
  readonly kind: TKind;
  readonly id: Brand<string, `plugin:${TKind}`>;
  readonly capabilities: PluginCapability<TKind>[];
  readonly defaults: TConfig;
  readonly execute: PluginHandle<TKind, TPayload>;
};

export type ContractMap<T extends readonly PluginContract<any, any, any>[]> =
  {
    [P in T[number] as `${P['kind']}/${P['id']}`]: P;
  };

export type ContractRegistry<T extends readonly PluginContract<any, any, any>[]> =
  Readonly<ContractMap<T>>;

export type PipelineSchema<T extends readonly PluginContract<PluginStage, any, any>[]> = {
  readonly stages: T extends readonly PluginContract<infer K, infer C, infer P>[]
    ? [
        Head<T>,
        ...T,
      ]
    : readonly [PluginContract<PluginStage, PluginConfig<PluginStage, unknown>, unknown>];
};

export type PathKey<T extends string> = T extends `${infer Prefix}/${infer Suffix}`
  ? Prefix extends ''
    ? 'root'
    : Prefix
  : T;

export type MergePluginPayloads<T extends readonly PluginContract<any, any, any>[]> =
  T extends [infer Head, ...infer Tail]
    ? Head extends PluginContract<infer K, infer C, infer P>
      ? Tail extends readonly PluginContract<any, any, any>[]
        ? { kind: K; payload: P } & MergePluginPayloads<Tail>
        : { kind: K; payload: P }
      : {}
    : {};

export interface ValidationIssue {
  readonly path: readonly string[];
  readonly message: string;
  readonly severity: 'error' | 'warn';
}

export type ValidationResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly errors: ValidationIssue[];
    };

export interface HorizonPlan<TKind extends PluginStage = PluginStage> {
  readonly id: PlanId;
  readonly tenantId: string;
  readonly startedAt: EpochMs;
  readonly pluginSpan: StageSpan<TKind>;
  readonly payload?: MergePluginPayloads<readonly PluginContract<any, any, any>[]>;
}

export type BuildRouteFromKinds<T extends readonly PluginStage[]> = JoinRoute<BuildRoute<JoinRoute<T & string[], ':'>>>;

export type ValidateHorizonTag<T extends string> =
  T extends `${infer Prefix}://${infer Service}`
    ? {
        tenantId: Prefix;
        service: Service;
      }
    : { tenantId: 'default'; service: T };

export type RecursionLimit<T extends number, Depth extends unknown[] = []> =
  Depth['length'] extends T
    ? never
    : Depth['length'];

export type RecursiveFlatten<T extends readonly unknown[], R extends unknown[] = []> =
  T extends readonly [infer H, ...infer Tail]
    ? H extends readonly unknown[]
      ? RecursiveFlatten<Tail, [...R, ...RecursiveFlatten<H> ]>
      : RecursiveFlatten<Tail, [...R, H]>
    : R;

export const horizonBrand = {
  fromTime: (value: number) => value as TimeMs,
  fromDate: (value: string) => value as IsoDatetime,
  fromRunId: (value: string) => value as RunId,
  fromPlanId: (value: string) => value as PlanId,
  fromJson: (value: JsonValue) => value,
} as const;

export type PluginPayload = JsonLike;

export type {
  HorizonTenant,
  HorizonSessionId,
  HorizonTraceId,
};
