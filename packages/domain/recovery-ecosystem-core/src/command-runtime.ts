import { asHealthScore, type LifecyclePhase } from './models';
import { asRunId, asTenantId, asTraceId, type NamespaceTag, type TenantId, type RunId } from './identifiers';
import type { JsonObject, JsonValue } from '@shared/type-level';
import type { NoInfer, PluginDependency, PluginName } from '@shared/typed-orchestration-core';
import {
  type EcosystemPlugin,
  EcosystemPluginRegistry,
  type RegisteredNames,
  type PluginInputByName,
  type PluginOutputByName,
} from './plugin-contract';

export type CommandVerb = 'inspect' | 'preflight' | 'execute' | 'rollback';
export type CommandNameRef<TCommand extends string = string> = `cmd:${Lowercase<TCommand>}`;
export type CommandEventKind<TVerb extends CommandVerb = CommandVerb> = `event:command-${TVerb}`;
export type CommandTraceId = ReturnType<typeof asTraceId>;
export type CommandRunId = ReturnType<typeof asRunId>;
export type CommandTenantId = ReturnType<typeof asTenantId>;

export interface CommandAttempt {
  readonly index: number;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly outcome: 'ok' | 'retry' | 'failed';
}

export interface CommandSummary {
  readonly attempts: readonly CommandAttempt[];
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
  readonly score: ReturnType<typeof asHealthScore>;
  readonly warnings: readonly string[];
}

export interface CommandEnvelope<TName extends string = string, TPayload extends JsonValue = JsonObject> {
  readonly id: CommandRunId;
  readonly name: CommandNameRef<TName>;
  readonly tenant: CommandTenantId;
  readonly namespace: NamespaceTag;
  readonly trace: CommandTraceId;
  readonly phase: LifecyclePhase;
  readonly payload: TPayload;
}

export interface CommandManifest {
  readonly name: string;
  readonly namespace: NamespaceTag;
  readonly version: `v${number}.${number}.${number}`;
  readonly tags: readonly `tag:${string}`[];
  readonly description: string;
}

export type CommandPayloadPath<TValue extends string> = TValue extends `${infer Head}/${infer Tail}`
  ? readonly [Head, ...CommandPayloadPath<Tail>]
  : readonly [TValue];

export type NormalizeCommandPath<TParts extends readonly string[]> = TParts extends readonly []
  ? 'command'
  : TParts extends readonly [infer Head extends string, ...infer Tail extends string[]]
    ? `${Head}/${NormalizeCommandPath<Tail>}`
    : string;

export type DependencyMatrix<TPlugins extends readonly EcosystemPlugin[]> = {
  [K in RegisteredNames<TPlugins>]: {
    readonly before: readonly PluginDependency[];
    readonly after: readonly PluginDependency[];
  };
};

export type CommandBatch<TPlugins extends readonly EcosystemPlugin[] = readonly EcosystemPlugin[], TName extends string = string> = readonly {
  readonly command: CommandNameRef<TName>;
  readonly input: JsonValue;
  readonly dependencies?: readonly PluginDependency[];
}[];

type CommandManifestTuple<TItems extends readonly string[], TAcc extends CommandManifest[] = []> =
  TItems extends readonly [infer Head extends string, ...infer Tail extends string[]]
    ? CommandManifestTuple<Tail, [...TAcc, {
      readonly name: Head;
      readonly namespace: `namespace:${Head}`;
      readonly version: 'v1.0.0';
      readonly tags: [`tag:${Head}`];
      readonly description: `manifest:${Head}`;
    }]>
    : TAcc;

type AsyncDisposer = {
  [Symbol.asyncDispose](): Promise<void>;
};

type AsyncStackLike = {
  new (): AsyncDisposer;
};

const AsyncDisposableStackCtor: AsyncStackLike =
  (globalThis as unknown as { AsyncDisposableStack?: AsyncStackLike }).AsyncDisposableStack ??
  (class {
    public [Symbol.asyncDispose](): Promise<void> {
      return Promise.resolve();
    }
  } as never);

class CommandRunScope implements AsyncDisposer {
  readonly #runId: CommandRunId;
  readonly #startedAt = new Date().toISOString();
  #closed = false;

  public constructor(runId: CommandRunId) {
    this.#runId = runId;
  }

  public get runId(): CommandRunId {
    return this.#runId;
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }

  public summary(): { readonly runId: CommandRunId; readonly startedAt: string; readonly closed: boolean } {
    return {
      runId: this.#runId,
      startedAt: this.#startedAt,
      closed: this.#closed,
    };
  }
}

const nowIso = (): string => new Date().toISOString();

export interface CommandDispatchResult<TName extends string = string, TOutput extends JsonValue = JsonValue> {
  readonly id: CommandRunId;
  readonly command: CommandNameRef<TName>;
  readonly namespace: NamespaceTag;
  readonly tenant: TenantId;
  readonly trace: CommandTraceId;
  readonly output: TOutput;
  readonly summary: CommandSummary;
}

export class CommandRuntime<TPlugins extends readonly EcosystemPlugin[]> {
  readonly #registry: EcosystemPluginRegistry<TPlugins>;
  readonly #manifest: CommandManifestTuple<readonly string[]>;

  public constructor(
    private readonly plugins: TPlugins,
    private readonly namespace: NamespaceTag,
  ) {
    this.#registry = new EcosystemPluginRegistry(this.plugins);
    this.#manifest = [] as CommandManifestTuple<readonly string[]>;
  }

  public commands(): readonly RegisteredNames<TPlugins>[] {
    return this.#registry.names();
  }

  public manifestByCommand(): CommandManifestTuple<readonly string[]> {
    const manifest = this.#manifest;
    return manifest as CommandManifestTuple<readonly string[]>;
  }

  public async dispatch<TName extends string>(
    name: CommandNameRef<TName>,
    input: NoInfer<JsonValue>,
    tenant: TenantId,
    attempts = 1,
  ): Promise<CommandDispatchResult<TName, JsonValue>> {
    const normalized = name as CommandNameRef<TName>;
    const trace = asTraceId(`${tenant}:${normalized}:${Math.floor(Math.random() * 10000)}`) as CommandTraceId;
    const runId = asRunId(`${tenant}:${normalized}`) as CommandRunId;

    const context = {
      runId,
      tenant,
      step: String(normalized),
      correlation: {
        runId,
        tenant,
      },
      input: input as JsonObject,
    } satisfies {
      runId: CommandRunId;
      tenant: TenantId;
      step: string;
      correlation: {
        runId: CommandRunId;
        tenant: TenantId;
      };
      input: JsonObject;
    };

    const summaries: CommandAttempt[] = [];
    const attemptsToRun = Array.from({ length: Math.max(1, Math.min(5, attempts)) }, (_entry, index) => index);

    const summaryFromAttempts = async (commandOutput: JsonValue): Promise<CommandDispatchResult<TName, JsonValue>> => {
      const status: CommandDispatchResult<TName, JsonValue> = {
        id: runId,
        command: normalized,
        namespace: this.namespace,
        tenant,
        trace,
        output: commandOutput,
        summary: {
          attempts: summaries,
          status: 'completed',
          score: asHealthScore(100),
          warnings: this.#evaluateWarnings(summaries),
        },
      };
      return status;
    };

    const output = await this.#withStack(async () => {
      const pluginOutput: JsonValue = await this.#withPluginOutput(name, input, context) as JsonValue;
      return pluginOutput;
    });

    for (const attempt of attemptsToRun) {
      summaries.push({
        index: attempt + 1,
        startedAt: nowIso(),
        durationMs: 16,
        outcome: 'ok',
      });
    }

    return summaryFromAttempts(output);
  }

  public async dispatchBatch<TName extends string>(
    batch: CommandBatch<TPlugins, TName>,
    tenantId: string,
    namespace: NamespaceTag = this.namespace,
  ): Promise<readonly CommandDispatchResult<TName, JsonValue>[]> {
    const tenant = asTenantId(tenantId);
    const output: CommandDispatchResult<TName, JsonValue>[] = [];
    for (const item of batch) {
      const commandName = item.command;
      const result = await this.dispatch<TName>(commandName, item.input as NoInfer<JsonValue>, tenant, 1);
      output.push(result as CommandDispatchResult<TName, JsonValue>);
    }
    void namespace;
    return output;
  }

  public dependencyMatrix(): DependencyMatrix<TPlugins> {
    return this.#buildDependencyMatrix(this.#registry);
  }

  public supports(name: RegisteredNames<TPlugins>): boolean {
    return this.#registry.has(name);
  }

  async #withStack<TValue>(operation: (stack: AsyncDisposer) => Promise<TValue>): Promise<TValue> {
    const Stack = AsyncDisposableStackCtor;
    await using stack = new Stack();
    const result = await operation(stack);
    await stack[Symbol.asyncDispose]();
    return result;
  }

  async #withPluginOutput(
    name: string,
    input: JsonValue,
    context: {
      runId: RunId;
      tenant: TenantId;
      step: string;
      correlation: { runId: RunId; tenant: TenantId };
      input: JsonObject;
    },
  ): Promise<PluginOutputByName<TPlugins, RegisteredNames<TPlugins>> | JsonValue> {
    const command = name as RegisteredNames<TPlugins>;
    if (!this.#registry.has(command as RegisteredNames<TPlugins>)) {
      return {
        output: {} as JsonValue,
        summary: `skip:${name}`,
        consumed: 0,
        produced: 0,
        artifacts: [],
      } as PluginOutputByName<TPlugins, RegisteredNames<TPlugins>>;
    }

    const output = await this.#registry.run(command, input as never, {
      runId: context.runId,
      tenant: context.tenant,
      step: context.step,
      correlation: context.correlation,
      input: context.input as never,
    } as never);
    return output;
  }

  #buildDependencyMatrix(registry: EcosystemPluginRegistry<TPlugins>): DependencyMatrix<TPlugins> {
    const output = {} as DependencyMatrix<TPlugins>;
    for (const command of this.commands()) {
      const before = [...registry.dependencies(command)].toSorted();
      output[command] = {
        before,
        after: before,
      };
    }
    return output;
  }

  #evaluateWarnings(attempts: readonly CommandAttempt[]): readonly string[] {
    return attempts
      .toSorted((left, right) => right.durationMs - left.durationMs)
      .map((entry) => `${entry.index}:${entry.outcome}` as const);
  }
}

export const createCommandRuntime = <TPlugins extends readonly EcosystemPlugin[]>(
  plugins: TPlugins,
  namespace: NamespaceTag,
): CommandRuntime<TPlugins> => new CommandRuntime(plugins, namespace);

export const isCommandEvent = (value: string): value is CommandEventKind =>
  /^event:command-/.test(value);

export const normalizeCommandName = <TName extends string>(value: TName): CommandNameRef<TName> =>
  `cmd:${value.toLowerCase().replace(/\s+/g, '-')}` as CommandNameRef<TName>;

export const ensureNamespace = (value: string): NamespaceTag => {
  const normalized = value.trim().replace(/\/+$/g, '').replace(/^namespace:/, 'namespace:');
  if (normalized.startsWith('namespace:')) {
    return normalized as NamespaceTag;
  }
  return `namespace:${normalized}` as NamespaceTag;
};

export const buildCommandManifest = (name: string, namespace: NamespaceTag): CommandManifest => {
  const normalized = normalizeCommandName(name);
  return {
    name: normalized,
    namespace,
    version: 'v1.0.0',
    tags: [`tag:${normalized}`],
    description: `runtime command for ${normalized}`,
  } satisfies CommandManifest;
};

export const commandEnvelope = <TValue extends JsonValue>(
  name: string,
  tenant: string,
  namespace: NamespaceTag,
  payload: TValue,
): CommandEnvelope<string, TValue> => {
  const normalized = normalizeCommandName(name);
  const trace = asTraceId(`tenant:${tenant}`);
  return {
    id: asRunId(`${name}:${Date.now()}`),
    name: normalized,
    tenant: asTenantId(tenant),
    namespace,
    trace,
    phase: 'queued',
    payload,
  };
};

export const commandPath = <TParts extends readonly string[]>(...parts: TParts): NormalizeCommandPath<TParts> =>
  parts.join('/') as NormalizeCommandPath<TParts>;

export const commandTraceFrom = (runId: CommandRunId): CommandTraceId => asTraceId(`trace:${runId}`);

export type CommandTrace<TValue = unknown> = {
  readonly trace: CommandTraceId;
  readonly run: CommandRunId;
  readonly payload: TValue;
};

export const projectCommandInputs = <TContext>(context: TContext): {
  readonly keys: readonly (string & keyof TContext)[];
  readonly values: readonly unknown[];
} => {
  const keys = Object.keys(context as Record<string, unknown>) as (string & keyof TContext)[];
  return {
    keys,
    values: keys.map((key) => context[key]),
  };
};

export const commandManifestTuple = <const TEntries extends readonly string[]>(
  entries: TEntries,
): CommandManifestTuple<TEntries> => {
  const manifests = entries.toSorted().map((entry) => ({
    name: entry,
    namespace: `namespace:${entry}` as NamespaceTag,
    version: 'v1.0.0' as const,
    tags: [`tag:${entry}` as `tag:${string}`],
    description: `manifest:${entry}` as const,
  }));
  return manifests as CommandManifestTuple<TEntries>;
};
