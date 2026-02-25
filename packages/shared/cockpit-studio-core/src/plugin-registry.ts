import type { NoInfer } from '@shared/type-level';
import {
  type PluginEvent,
  type PluginDependency,
  type PluginId,
  type PluginKind,
  type StudioContext,
  type StudioPluginDefinition,
  type StudioPluginInput,
  type StudioPluginOutput,
  STAGE_ORDER,
} from './contracts';

type AsyncDisposer = {
  [Symbol.asyncDispose](): PromiseLike<void>;
};

type AsyncStack = {
  use<T extends AsyncDisposer>(value: T): T;
  adopt<T extends AsyncDisposer>(value: T): T;
  [Symbol.asyncDispose](): Promise<void>;
};

const createAsyncStack = (): new () => AsyncStack => {
  const Ctor = (globalThis as unknown as { AsyncDisposableStack?: new () => AsyncStack }).AsyncDisposableStack;
  if (typeof Ctor === 'function') {
    return Ctor;
  }
  return class FallbackAsyncDisposableStack implements AsyncStack {
    #disposables: AsyncDisposer[] = [];
    use<T extends AsyncDisposer>(value: T): T {
      this.adopt(value);
      return value;
    }
    adopt<T extends AsyncDisposer>(value: T): T {
      this.#disposables.push(value);
      return value;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      while (this.#disposables.length > 0) {
        const resource = this.#disposables.pop();
        await resource?.[Symbol.asyncDispose]();
      }
    }
  };
};

export interface PluginExecutionDiagnostics {
  info: number;
  warn: number;
  error: number;
}

interface EventEnvelope {
  readonly pluginId: PluginId;
  readonly kind: string;
}

export interface PluginExecutionRequest<TInput extends Record<string, unknown>> {
  readonly input: TInput;
  readonly context: Omit<StudioPluginRegistryContext, 'sequence'>;
  readonly stages?: readonly PluginId[];
  readonly dryRun?: boolean;
}

export interface StudioPluginRegistryContext extends StudioContext {
  readonly sequence: readonly PluginId[];
  readonly strict: boolean;
  readonly traceLevel: 'off' | 'minimal' | 'verbose';
  readonly parallelism: number;
}

export type PluginExecutionEnvelope<TPayload = Record<string, unknown>> = {
  readonly ok: true;
  readonly value: {
    readonly payload: TPayload;
    readonly events: readonly PluginEvent[];
    readonly diagnostics: PluginExecutionDiagnostics;
  };
  readonly pluginId: PluginId;
} | {
  readonly ok: false;
  readonly error: string;
  readonly pluginId: PluginId;
};

export type PluginLookup<TPlugins extends readonly StudioPluginDefinition[]> = {
  [TEntry in TPlugins[number] as TEntry['id']]: TEntry;
};

const createEvent = (runId: string, entry: EventEnvelope): PluginEvent => ({
  kind: `studio.stage.${entry.kind}` as PluginEvent['kind'],
  pluginId: entry.pluginId,
  runId: runId as PluginEvent['runId'],
  at: new Date().toISOString(),
  data: { event: entry.kind },
});

export class StudioPluginRegistry<TPlugins extends readonly StudioPluginDefinition[]> {
  readonly #definitions: TPlugins;
  readonly #lookup: Map<PluginId, StudioPluginDefinition>;

  constructor(definitions: TPlugins) {
    this.#definitions = definitions;
    this.#lookup = new Map(definitions.map((entry) => [entry.id, entry]));
  }

  public definitionList(): Readonly<TPlugins> {
    return this.#definitions;
  }

  public pluginIds(): readonly PluginId[] {
    return [...this.#lookup.keys()].toSorted((left, right) => left.localeCompare(right));
  }

  public pluginById<TId extends PluginId>(pluginId: NoInfer<TId>): TPlugins[number] | undefined {
    return this.#lookup.get(pluginId) as TPlugins[number] | undefined;
  }

  public has(pluginId: PluginId): boolean {
    return this.#lookup.has(pluginId);
  }

  public stageCounts(): { readonly [K in PluginKind]: number } {
    const counts = {
      ingest: 0,
      validate: 0,
      plan: 0,
      simulate: 0,
      execute: 0,
      observe: 0,
      verify: 0,
      finalize: 0,
    };
    for (const definition of this.#definitions) {
      counts[definition.kind] += 1;
    }
    return counts;
  }

  public toRecord(): PluginLookup<TPlugins> {
    return Object.fromEntries(this.#lookup.entries()) as PluginLookup<TPlugins>;
  }

  public executionOrder(stages?: readonly PluginKind[]): readonly PluginId[] {
    const requested = new Set(stages ?? []);
    const ordered = [...this.#lookup.values()]
      .filter((definition) => requested.size === 0 || requested.has(definition.kind))
      .toSorted((left, right) => STAGE_ORDER[left.kind] - STAGE_ORDER[right.kind] || left.id.localeCompare(right.id))
      .map((definition) => definition.id);
    return ordered;
  }

  public async execute<TInput extends Record<string, unknown>, TOutput = Record<string, unknown>>(
    request: PluginExecutionRequest<NoInfer<TInput>>,
  ): Promise<PluginExecutionEnvelope<TOutput>> {
    const diagnostics: PluginExecutionDiagnostics = { info: 0, warn: 0, error: 0 };
    const eventLog: PluginEvent[] = [];
    const sequence = request.stages ?? this.pluginIds();
    let payload: Record<string, unknown> = { ...request.input };
    let lastPluginId: PluginId | undefined;
    const AsyncDisposableStackCtor = createAsyncStack();
    await using stack = new AsyncDisposableStackCtor();

    for (const pluginId of sequence) {
      const plugin = this.#lookup.get(pluginId);
      if (!plugin) {
        diagnostics.warn += 1;
        eventLog.push({
          kind: `studio.warning.${pluginId}` as PluginEvent['kind'],
          pluginId,
          runId: request.context.runId,
          at: new Date().toISOString(),
          data: { missing: pluginId },
        });
        if (request.context.strict) {
        return {
          ok: false,
          error: `missing-plugin:${pluginId}`,
          pluginId,
        };
        }
        continue;
      }

      stack.use({
        [Symbol.asyncDispose]: async () => undefined,
      });
      lastPluginId = pluginId;
      if (request.dryRun) {
        diagnostics.info += 1;
        continue;
      }

      const pluginInput: StudioPluginInput = {
        kind: plugin.input.schema.kind,
        data: payload,
      };
      try {
        const pluginOutput: StudioPluginOutput = await plugin.run(pluginInput, {
          tenantId: request.context.tenantId,
          workspaceId: request.context.workspaceId,
          runId: request.context.runId,
          at: new Date().toISOString(),
          metadata: request.context.metadata,
        });
        eventLog.push(createEvent(request.context.runId, { pluginId, kind: `${plugin.kind}` }));
        diagnostics.info += 1;
        payload = {
          ...payload,
          ...pluginOutput.data,
          stage: plugin.kind,
          score: pluginOutput.score,
        };
      } catch (error) {
        diagnostics.error += 1;
        eventLog.push({
          kind: `studio.error.${pluginId}` as PluginEvent['kind'],
          pluginId,
          runId: request.context.runId,
          at: new Date().toISOString(),
          data: {
            error: `${error}`,
          },
        } satisfies PluginEvent);
        if (request.context.strict) {
          return {
            ok: false,
            error: `${error}`,
            pluginId,
          };
        }
      }
    }

    return {
      ok: true,
      pluginId: lastPluginId ?? request.context.runId as PluginId,
      value: {
        payload: payload as TOutput,
        events: eventLog.toSorted((left, right) => left.at.localeCompare(right.at)),
        diagnostics,
      },
    };
  }
}

export const registerStudioPlugins = <TPlugins extends readonly StudioPluginDefinition[]>(
  plugins: TPlugins,
): StudioPluginRegistry<TPlugins> => new StudioPluginRegistry(plugins);

export const normalizeDependencies = (
  dependencies: readonly PluginDependency[],
  filterOptional = false,
): readonly PluginDependency[] =>
  dependencies
    .toSorted((left, right) => right.weight - left.weight)
    .filter((entry) => (filterOptional ? !entry.optional : true));
