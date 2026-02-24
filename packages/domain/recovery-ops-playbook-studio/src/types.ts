import type { Brand } from '@shared/core';
import type { NoInfer } from '@shared/type-level';

export type WorkspaceId = Brand<`workspace:${string}`, 'RecoveryOpsPlaybookWorkspaceId'>;
export type TenantId = Brand<`tenant:${string}`, 'RecoveryOpsPlaybookTenantId'>;
export type RunId = Brand<`${TenantId}::${WorkspaceId}::${string}`, 'RecoveryOpsPlaybookRunId'>;

export type PluginNamespace = Brand<`playbook:${string}`, 'RecoveryOpsPlaybookNamespace'>;
export type PluginName = Brand<`plugin:${string}`, 'RecoveryOpsPlaybookPluginName'>;
export type PluginVersion = Brand<`v${number}.${number}.${number}`, 'RecoveryOpsPlaybookPluginVersion'>;
export type PluginTag = Brand<`${PluginNamespace}/${PluginName}:${PluginVersion}`, 'RecoveryOpsPlaybookPluginTag'>;
export type PluginState = 'discover' | 'plan' | 'simulate' | 'execute' | 'verify' | 'finalize';

export const KNOWN_STAGES = ['discover', 'plan', 'simulate', 'execute', 'verify', 'finalize'] as const;
export type KnownStage = (typeof KNOWN_STAGES)[number];

export type StageTransition<T extends PluginState> = {
  readonly from: T;
  readonly to: Exclude<PluginState, T> | T;
};

export interface PlaybookCoordinates {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly runId: RunId;
}

export interface PluginDiagnostic {
  readonly pluginId: PluginTag;
  readonly message: string;
  readonly severity: 'info' | 'warn' | 'error';
  readonly timestamp: string;
}

export interface PlaybookPluginContext {
  readonly coordinates: PlaybookCoordinates;
  readonly now: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PlaybookExecutionTrace {
  readonly runId: RunId;
  readonly pluginOrder: readonly PluginTag[];
  readonly totals: {
    readonly elapsedMs: number;
    readonly errorCount: number;
    readonly warningCount: number;
  };
}

export interface PlaybookNode {
  readonly id: Brand<`${TenantId}:${string}`, 'PlaybookNode'>;
  readonly name: string;
  readonly phase: PluginState;
  readonly tags: readonly string[];
}

export interface PlaybookEdge {
  readonly from: PlaybookNode['id'];
  readonly to: PlaybookNode['id'];
  readonly affinity: number;
}

export interface PlaybookGraph {
  readonly nodes: readonly PlaybookNode[];
  readonly edges: readonly PlaybookEdge[];
}

export interface PluginInputEnvelope<TPayload extends Record<string, unknown>> {
  readonly pluginId: PluginTag;
  readonly payload: TPayload;
  readonly context: PlaybookPluginContext;
}

export interface PluginOutputEnvelope<TOutput extends Record<string, unknown>> {
  readonly pluginId: PluginTag;
  readonly output: TOutput;
  readonly diagnostics: readonly PluginDiagnostic[];
}

export interface PlaybookCatalogEntry {
  readonly key: PluginTag;
  readonly namespace: PluginNamespace;
  readonly name: PluginName;
  readonly version: PluginVersion;
  readonly stage: PluginState;
  readonly priority: number;
  readonly labels: readonly string[];
  readonly description: string;
}

export interface PlaybookCatalogManifest {
  readonly namespace: PluginNamespace;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly entries: readonly PlaybookCatalogEntry[];
}

export interface PlaybookManifestStats {
  readonly totalEntries: number;
  readonly namespaceCount: number;
  readonly latestVersion: PluginVersion;
  readonly generatedAt: string;
}

export interface PlaybookPluginDefinition<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly namespace: PluginNamespace;
  readonly name: PluginName;
  readonly version: PluginVersion;
  readonly stage: PluginState;
  readonly id: PluginTag;
  readonly order: number;
  readonly dependencies: readonly PluginTag[];
  readonly input: NoInfer<TInput>;
  readonly output: NoInfer<TOutput>;
  readonly metadata: Readonly<Record<string, unknown>>;
  execute(
    input: NoInfer<TInput> & Record<string, unknown>,
    context: PlaybookPluginContext,
  ): Promise<PluginOutputEnvelope<TOutput>>;
  readonly dispose?: () => Promise<void>;
}

export type PluginEnvelopeKey<TPlugin extends PlaybookPluginDefinition> = `${TPlugin['namespace']}/${TPlugin['name']}`;
export type PluginId<TNamespace extends string, TName extends string> = `${TNamespace}/${TName}`;

export type PluginByIndex<
  TPlugins extends readonly PlaybookPluginDefinition[],
  TName extends string,
> = Extract<TPlugins[number], { readonly name: TName }>;

export type PluginByNamespace<
  TPlugins extends readonly PlaybookPluginDefinition[],
  TNamespace extends string,
> = Extract<TPlugins[number], { readonly namespace: TNamespace }>;

export type PluginInput<TPlugin extends PlaybookPluginDefinition> =
  TPlugin extends PlaybookPluginDefinition<infer TInput, infer TOutput>
    ? {
        input: TInput;
        output: TOutput;
      }
    : never;

export type PluginRecord<TPlugins extends readonly PlaybookPluginDefinition[]> = {
  [K in TPlugins[number] as PluginEnvelopeKey<K>]: K;
};

export type StageTransitionMap<TState extends PluginState = PluginState> = {
  readonly transitions: readonly StageTransition<TState>[];
  readonly retryWindowMs: number;
  readonly maxRetries: number;
};

export type StageRank<TStage extends PluginState> = TStage extends (typeof KNOWN_STAGES)[number]
  ? (typeof STAGE_ORDER_MAP)[TStage]
  : never;

export const STAGE_ORDER_MAP: { readonly [K in KnownStage]: number } = KNOWN_STAGES
  .reduce((acc, stage, index) => {
    acc[stage] = index;
    return acc;
  }, {} as { [K in KnownStage]: number }) satisfies { [K in KnownStage]: number };

export type RecursiveTuple<T extends readonly unknown[], TAccumulator extends readonly unknown[] = []> =
  T extends readonly [infer Head, ...infer Tail]
    ? RecursiveTuple<Tail, readonly [...TAccumulator, Head]>
    : TAccumulator;

export type StageTupleFromList<T extends readonly PluginState[]> = RecursiveTuple<T>;

export type VariadicJoin<TTuple extends readonly string[]> = TTuple extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
  ? `${Head}${Tail extends [] ? '' : `.${VariadicJoin<Tail>}`}`
  : string;

export type KeyPath<T> =
  T extends readonly any[]
    ? never
    : T extends object
      ? {
          [K in keyof T & string]:
            T[K] extends object
              ? `${K}` | `${K}.${KeyPath<T[K]>}`
              : K;
        }[keyof T & string]
      : never;

export type RenameKeysToId<T extends Record<string, unknown>> = {
  [K in keyof T as `${string & K}_${Extract<K, string>}`]: T[K];
};

export type PluginDiagnosticSeverity = PluginDiagnostic['severity'];
export type PluginDiagnosticBySeverity<
  TSource extends Partial<Record<PluginDiagnosticSeverity, readonly PluginDiagnostic[]>> = Record<
    PluginDiagnosticSeverity,
    readonly PluginDiagnostic[]
  >,
> = {
  [K in PluginDiagnostic['severity']]: K extends keyof TSource ? TSource[K] : readonly PluginDiagnostic[];
};

export type PluginDiagnosticsBuckets<
  TSource extends Partial<Record<PluginDiagnosticSeverity, readonly PluginDiagnostic[]>> = Record<
    PluginDiagnosticSeverity,
    readonly PluginDiagnostic[]
  >,
> =
  PluginDiagnosticBySeverity<TSource>;

export const isTerminalStage = (stage: PluginState): stage is 'finalize' | 'verify' =>
  stage === 'verify' || stage === 'finalize';

export const isPlaybookCatalogEntry = (entry: {
  namespace: unknown;
  name: unknown;
  version: unknown;
  stage: unknown;
}): entry is PlaybookCatalogEntry =>
  typeof entry.namespace === 'string'
    && typeof entry.name === 'string'
    && typeof entry.version === 'string'
    && typeof entry.stage === 'string'
    && KNOWN_STAGES.includes(entry.stage as PluginState);
