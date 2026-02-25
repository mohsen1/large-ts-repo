export type Brand<K extends string, T extends string | number> = T & { readonly __brand: K };

export type TenantId = Brand<'tenant-id', string>;
export type WorkspaceId = Brand<'workspace-id', string>;
export type RunId = Brand<'run-id', string>;
export type PluginKind = 'ingest' | 'validate' | 'plan' | 'simulate' | 'execute' | 'observe' | 'verify' | 'finalize';
export type PluginId = `studio-${string}`;
export type PluginEventKind = `studio.${PluginKind}` | `studio.stage.${PluginKind}` | `studio.${string}`;
export type TemplateKey<T extends string> = `${T}::${string}`;

export interface PluginDependency {
  readonly upstreamId: PluginId;
  readonly optional: boolean;
  readonly weight: number;
}

export interface StudioPluginInput {
  readonly kind: string;
  readonly data: Record<string, unknown>;
}

export interface StudioPluginOutput {
  readonly kind: string;
  readonly data: Record<string, unknown>;
  readonly score: number;
}

export interface StudioPluginDefinition {
  readonly domain: string;
  readonly name: string;
  readonly kind: PluginKind;
  readonly id: PluginId;
  readonly namespace: string;
  readonly title: string;
  readonly description: string;
  readonly version: `v${number}.${number}.${number}`;
  readonly tags: readonly string[];
  readonly dependencies: readonly PluginDependency[];
  readonly input: {
    readonly schema: StudioPluginInput;
    readonly examples: readonly Record<string, unknown>[];
  };
  readonly output: {
    readonly schema: StudioPluginOutput;
    readonly examples: readonly StudioPluginOutput[];
  };
  readonly run: (input: StudioPluginInput, context: StudioContext) => Promise<StudioPluginOutput>;
}

export interface StudioContext {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly runId: RunId;
  readonly at: string;
  readonly metadata: Record<string, string>;
}

export type PluginExecutionResult<TPayload = unknown> =
  | {
      readonly ok: true;
      readonly payload: TPayload;
      readonly pluginId: PluginId;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly pluginId: PluginId;
    };

export type PluginExecutionContext = StudioContext;
export type PluginRunContext = StudioContext;
export type PluginExecutionOptions = {
  readonly dryRun?: boolean;
  readonly strict?: boolean;
  readonly trace?: boolean;
};

export interface StudioManifestCatalog {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly spec: {
    readonly seed: number;
    readonly parallelism: number;
    readonly strict: boolean;
    readonly traceLevel: 'off' | 'minimal' | 'verbose';
  };
  readonly pluginIds: readonly PluginId[];
  readonly pluginCatalog: readonly StudioPluginDefinition[];
  readonly stageWeights: readonly {
    readonly stage: string;
    readonly weight: number;
  }[];
}

export type PluginEvent<
  TKind extends PluginEventKind = PluginEventKind,
  TData extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly kind: TKind;
  readonly pluginId: PluginId;
  readonly runId: RunId;
  readonly at: string;
  readonly data: TData;
};

export interface StudioRunSnapshot {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly runId: RunId;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly stages: readonly PluginId[];
  readonly eventStream: readonly PluginEvent[];
}

export interface StudioRunInput {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scenarioId: TemplateKey<'scenario'>;
  readonly stageLimit?: readonly PluginKind[];
  readonly payload: Record<string, unknown>;
}

export interface StudioRunOutput {
  readonly runId: RunId;
  readonly ok: boolean;
  readonly events: readonly PluginEvent[];
  readonly result: StudioPluginOutput;
  readonly snapshot: StudioRunSnapshot;
  readonly graph: readonly PluginId[];
}

export type StudioPluginEvent = PluginEvent;

export type OutputOfPlugin<T extends StudioPluginDefinition> = T['output']['schema'];
export type InputOfPlugin<T extends StudioPluginDefinition> = T['input']['schema'];
export type PluginInputTuple<T extends readonly StudioPluginDefinition[]> = {
  readonly [K in keyof T]: InputOfPlugin<T[K]>;
};

export type PublicKeys<T extends Record<string, unknown>> = {
  [K in keyof T as K extends `_${string}` ? never : K]: T[K];
};

export type RecursiveTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...RecursiveTuple<Tail>]
  : readonly [];

export const STAGE_SEQUENCE = ['ingest', 'validate', 'plan', 'simulate', 'execute', 'observe', 'verify', 'finalize'] as const;
export const STAGE_BY_WEIGHT = STAGE_SEQUENCE.map((kind, weight) => ({ kind, weight }));
export const STAGE_ORDER = STAGE_BY_WEIGHT.reduce<Record<PluginKind, number>>(
  (acc, entry) => {
    acc[entry.kind] = entry.weight + 1;
    return acc;
  },
  {
    ingest: 0,
    validate: 0,
    plan: 0,
    simulate: 0,
    execute: 0,
    observe: 0,
    verify: 0,
    finalize: 0,
  } satisfies Record<PluginKind, number>,
);

export const parseTenantId = (value: string): TenantId => value as TenantId;
export const parseWorkspaceId = (value: string): WorkspaceId => value as WorkspaceId;
export const parseRunId = (value: string): RunId => value as RunId;
