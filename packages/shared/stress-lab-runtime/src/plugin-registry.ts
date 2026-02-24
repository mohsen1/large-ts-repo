import {
  buildPluginVersion,
  canonicalizeNamespace,
  type PluginDependency,
  type PluginVersion,
  type PluginEventName,
  type PluginId,
  type PluginKind,
  type PluginNamespace,
  buildPluginId,
} from './ids';
import { isIterable, type IteratorStep } from './iterator-utils';

export interface PluginContext<TConfig = Record<string, unknown>> {
  readonly tenantId: string;
  readonly requestId: string;
  readonly namespace: PluginNamespace;
  readonly startedAt: string;
  readonly config: TConfig;
}

export type PluginResult<TValue> = {
  readonly ok: boolean;
  readonly value?: TValue;
  readonly errors?: readonly string[];
  readonly generatedAt: string;
};

export type PluginResultOk<T> = PluginResult<T> & {
  readonly ok: true;
  readonly value: T;
};

export interface PluginTelemetry {
  readonly eventName: PluginEventName;
  readonly severity: 'trace' | 'info' | 'warn' | 'error';
  readonly timestamp: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface PluginExecutionRecord<TInput, TOutput> {
  readonly pluginId: PluginId;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly input: TInput;
  readonly output: PluginResult<TOutput>;
}

export interface PluginEvent {
  readonly name: PluginEventName;
  readonly pluginId: PluginId;
  readonly at: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type PluginDefinition<
  TInput = unknown,
  TOutput = unknown,
  TConfig = Record<string, unknown>,
  TKind extends PluginKind = PluginKind,
> = {
  readonly id: PluginId;
  readonly name: string;
  readonly namespace: PluginNamespace;
  readonly kind: TKind;
  readonly version: PluginVersion;
  readonly tags: readonly string[];
  readonly dependencies: readonly PluginDependency[];
  readonly config: TConfig;
  readonly run: (context: PluginContext<TConfig>, input: TInput) => Promise<PluginResult<TOutput>>;
};

export type PluginInputOf<TDefinition> = TDefinition extends PluginDefinition<infer TInput, any, any, any> ? TInput : never;
export type PluginOutputOf<TDefinition> = TDefinition extends PluginDefinition<any, infer TOutput, any, any> ? TOutput : never;
export type PluginKindOf<TDefinition> = TDefinition extends PluginDefinition<any, any, any, infer TKind> ? TKind : never;

export type PluginDefinitionByKind<TCatalog extends Record<string, PluginDefinition<any, any, any, PluginKind>>> = {
  [K in keyof TCatalog as TCatalog[K] extends PluginDefinition<any, any, any, infer Kind> ? Kind & PluginKind : never]: TCatalog[K];
};

export type PluginDefinitionInput<T> = T extends PluginDefinition<infer I, any, any, any> ? I : never;
export type PluginDefinitionOutput<T> = T extends PluginDefinition<any, infer O, any, any> ? O : never;

export type RecursiveChainInput<
  T extends readonly PluginDefinition[],
  TFirst extends PluginDefinition<TAnyInput, any, any, any> = T extends readonly [
    infer Head extends PluginDefinition<any, any, any, any>,
    ...PluginDefinition[],
  ]
    ? Head
    : never,
  TAnyInput = PluginInputOf<TFirst>,
> = T extends readonly [
  infer Head extends PluginDefinition<TAnyInput, any, any, any>,
  ...infer Tail extends readonly PluginDefinition[],
]
  ? Tail extends readonly [
    infer Next extends PluginDefinition<PluginOutputOf<Head>, any, any, any>,
    ...readonly PluginDefinition[],
  ]
    ? Tail
    : []
  : never;

export type CompatibleChain<TChain extends readonly PluginDefinition[]> =
  TChain extends readonly []
    ? []
    : TChain extends readonly [infer Head extends PluginDefinition, ...infer Tail extends readonly PluginDefinition[]]
      ? Tail extends readonly []
        ? [Head]
        : [Head, ...CompatibleChain<RecursiveChainInput<TChain, Head>>]
      : never;

export type FinalChainOutput<TChain extends readonly PluginDefinition[]> = TChain extends readonly [...any[], infer Tail]
  ? Tail extends PluginDefinition<any, infer LastOutput, any, any>
    ? LastOutput
    : never
  : never;

export interface PluginRegistrySummary {
  readonly namespace: PluginNamespace;
  readonly registered: number;
  readonly kinds: readonly string[];
  readonly dependencies: readonly PluginDependency[];
}

export class PluginRegistry<TCatalog extends Record<string, PluginDefinition> = Record<string, PluginDefinition>> {
  private readonly plugins = new Map<string, PluginDefinition<any, any, any, PluginKind>>();

  private constructor(private readonly namespace: PluginNamespace) {}

  register<TInput, TOutput, TConfig extends Record<string, unknown>, TKind extends PluginKind>(
    plugin: PluginDefinition<TInput, TOutput, TConfig, TKind>,
  ): this {
    const key = `${plugin.namespace}::${plugin.id}`;
    this.plugins.set(key, plugin);
    return this;
  }

  get<TPlugin extends PluginDefinition>(id: string): TPlugin | undefined {
    return this.plugins.get(id) as TPlugin | undefined;
  }

  list(): readonly PluginDefinition[] {
    return [...this.plugins.values()];
  }

  kinds(): readonly string[] {
    const kinds: PluginKind[] = [];
    for (const entry of this.plugins.values()) {
      kinds.push(entry.kind);
    }
    return Array.from(new Set(kinds));
  }

  summary(): PluginRegistrySummary {
    return {
      namespace: this.namespace,
      registered: this.plugins.size,
      kinds: this.kinds(),
      dependencies: Array.from(
        new Set(
          collectDependencies(this.plugins.values()),
        ),
      ),
    };
  }

  static create(namespace: PluginNamespace): PluginRegistry {
    return new PluginRegistry(namespace);
  }
}

export const buildPluginDefinition = <
  const TKind extends PluginKind,
  TInput,
  TOutput,
  TConfig extends Record<string, unknown> = Record<string, unknown>,
>(
  namespace: PluginNamespace,
  kind: TKind,
  config: {
    readonly name: string;
    readonly version: PluginVersion;
    readonly tags: readonly string[];
    readonly dependencies: readonly PluginDependency[];
    readonly pluginConfig: TConfig;
    readonly run: (context: PluginContext<TConfig>, input: TInput) => Promise<PluginResult<TOutput>>;
  },
): PluginDefinition<TInput, TOutput, TConfig, TKind> => ({
  id: buildPluginId(namespace, kind, `${config.name}`),
  name: config.name,
  namespace,
  kind,
  version: config.version,
  tags: config.tags,
  dependencies: config.dependencies,
  config: config.pluginConfig,
  run: config.run,
});

export const isPluginDefinition = (
  value: unknown,
): value is PluginDefinition<unknown, unknown, Record<string, unknown>, PluginKind> => {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }

  return (
    'id' in value &&
    'name' in value &&
    'kind' in value &&
    'run' in value &&
    typeof (value as PluginDefinition)['run'] === 'function' &&
    isIterable((value as PluginDefinition).tags)
  );
}

export const runPluginSafe = async <
  TInput,
  TOutput,
  TContext extends object,
>(
  plugin: PluginDefinition<TInput, TOutput, TContext>,
  context: PluginContext<TContext>,
  input: TInput,
): Promise<PluginResult<TOutput>> => {
  try {
    return await plugin.run(context, input);
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      generatedAt: new Date().toISOString(),
    };
  }
};

export const runPluginWithSafeEnvelope = runPluginSafe;

export const collectPluginEvents = (
  records: readonly PluginExecutionRecord<unknown, unknown>[],
): readonly PluginEvent[] => {
  return records.map((record) => ({
    name: `stress-lab/post:${record.pluginId}` as PluginEventName,
    pluginId: record.pluginId,
    at: record.finishedAt,
    metadata: {
      ok: record.output.ok,
      valueType: String(typeof record.output.value),
      errorCount: record.output.errors?.length ?? 0,
    },
  }));
};

export async function executePluginChain<
  const TChain extends readonly PluginDefinition[],
  const TInput,
>(
  chain: CompatibleChain<TChain> & readonly PluginDefinition[],
  context: PluginContext,
  input: TInput,
): Promise<PluginResult<FinalChainOutput<TChain>>> {
  let current: unknown = input;
  const executionLog: PluginExecutionRecord<unknown, unknown>[] = [];

  for (const plugin of chain as readonly PluginDefinition<unknown, unknown, any, PluginKind>[]) {
    const startedAt = new Date().toISOString();
    const output = await runPluginSafe(plugin, context as PluginContext<any>, current);
    const finishedAt = new Date().toISOString();
    executionLog.push({
      pluginId: plugin.id,
      startedAt,
      finishedAt,
      input: current,
      output,
    });
    if (!output.ok || output.value === undefined) {
      return {
        ok: false,
        generatedAt: finishedAt,
        errors: output.errors ?? ['plugin returned failure'],
      };
    }
    current = output.value;
  }

  return {
    ok: true,
    value: current as FinalChainOutput<TChain>,
    generatedAt: new Date().toISOString(),
  };
}

export const mapSteps = (
  entries: Iterable<IteratorStep<PluginDefinition>>,
): PluginContext<Record<string, unknown>>[] => {
  const output: PluginContext<Record<string, unknown>>[] = [];
  for (const entry of entries) {
    const context = {
      tenantId: 'steps',
      requestId: `step-${entry.index}`,
      namespace: canonicalizeNamespace('recovery:stress:lab'),
      startedAt: new Date().toISOString(),
      config: { step: entry.value },
    };
    output.push(context);
  }
  return output;
};

export const createPluginDefinitionNamespace = (name: string): PluginNamespace => {
  return canonicalizeNamespace(name);
};

export const createPluginKind = (suffix: string): PluginKind => `stress-lab/${suffix}`;

export const createPluginVersion = (major: number, minor: number, patch: number): PluginVersion => {
  return buildPluginVersion(major, minor, patch);
};

const collectDependencies = (definitions: Iterable<PluginDefinition>): readonly PluginDependency[] => {
  const output: PluginDependency[] = [];
  for (const definition of definitions) {
    for (const dependency of definition.dependencies) {
      output.push(dependency);
    }
  }
  return output;
};

export type { PluginId, PluginNamespace, PluginKind, PluginVersion, PluginDependency, PluginEventName };
