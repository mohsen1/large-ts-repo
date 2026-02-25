import { setTimeout } from 'node:timers/promises';
import {
  buildRunId,
  controlLabStageKey,
  PluginOutputChain,
  LAB_NAMESPACE,
  type ControlLabBlueprint,
  type ControlLabContext,
  type ControlLabPlugin,
  type ControlLabRuntimeEvent,
  type ControlLabRuntimeOptions,
  type ControlLabTimeline,
  type ControlLabVerb,
  type LabRunId,
  type LabRunOutput,
} from './types';
import { PluginRegistry } from './registry';

type AsyncStackLike = {
  use<T>(value: T): void;
  [Symbol.asyncDispose](): PromiseLike<void>;
  [Symbol.dispose](): void;
};

const resolveAsyncStack = (): { new (): AsyncStackLike } => {
  const globalStack =
    (globalThis as unknown as { readonly AsyncDisposableStack?: { new (): AsyncStackLike } }).AsyncDisposableStack;
  if (globalStack) {
    return globalStack;
  }

  class FallbackAsyncDisposableStack implements AsyncStackLike {
    readonly #resources: Array<{ [Symbol.asyncDispose]?: () => PromiseLike<void>; [Symbol.dispose]?: () => void }> = [];

    use<T>(value: T): void {
      this.#resources.push(value as { [Symbol.asyncDispose]?: () => PromiseLike<void>; [Symbol.dispose]?: () => void });
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (const resource of [...this.#resources].reverse()) {
        await resource[Symbol.asyncDispose]?.();
        resource[Symbol.dispose]?.();
      }
      this.#resources.length = 0;
    }

    [Symbol.dispose](): void {
      void this[Symbol.asyncDispose]();
    }
  }

  return FallbackAsyncDisposableStack;
};

export interface RunDiagnostics {
  readonly startedAt: string;
  readonly runId: LabRunId;
  readonly events: readonly ControlLabRuntimeEvent[];
}

export type ExecutionResult<TOutput, TBlueprint extends ControlLabBlueprint> = LabRunOutput<TOutput> & {
  readonly blueprint: TBlueprint;
  readonly diagnostics: RunDiagnostics;
  readonly finalOutput: PluginOutputChain<readonly ControlLabPlugin[]>;
};

export class RuntimeLease<TPlugins extends readonly ControlLabPlugin[]> implements AsyncDisposable {
  readonly #registry: PluginRegistry<TPlugins>;
  readonly #options: ControlLabRuntimeOptions;
  readonly #stack: AsyncStackLike;

  constructor(
    plugins: TPlugins,
    options: ControlLabRuntimeOptions = {},
  ) {
    this.#registry = new PluginRegistry(plugins, {
      capacity: plugins.length,
      eagerResolve: options.retryCount != null && options.retryCount > 0,
      failFast: true,
    });
    const AsyncStack = resolveAsyncStack();
    this.#stack = new AsyncStack();
    this.#options = options;
  }

  async run<TInput>(
    blueprint: ControlLabBlueprint,
    contextBase: Omit<ControlLabContext, 'runId' | 'pluginId'>,
    input: TInput,
  ): Promise<ExecutionResult<unknown, ControlLabBlueprint>> {
    const runId = buildRunId(contextBase.tenantId as string, blueprint.workspaceId as string);
    const start = Date.now();
    const runContextBase: ControlLabContext = {
      ...contextBase,
      runId,
      pluginId: blueprint.pluginKinds[0] as never,
      signature: `${contextBase.signature}::${blueprint.blueprintId}`,
    };

    const stageMap = this.#registry.runOrder(runContextBase);
    const events: ControlLabRuntimeEvent[] = [];
    let cursor: unknown = input;

    for (const plugin of stageMap) {
      const trace = controlLabStageKey(plugin.stage);
      const context: ControlLabContext = {
        ...runContextBase,
        pluginId: plugin.id,
        context: {
          ...plugin.metadata,
          trace,
        },
        signature: `${runContextBase.signature}::${plugin.id}`,
      };
      const eventKind = `${plugin.stage}/${LAB_NAMESPACE}` as ControlLabRuntimeEvent['kind'];

      events.push({
        kind: eventKind,
        runId,
        payload: {
          plugin: plugin.name,
          kind: plugin.kind,
          context,
          trace,
        },
        trace,
      });

      try {
        const pluginOutput = await plugin.run(cursor as never, context);
        cursor = pluginOutput.output;
        if (pluginOutput.status === 'failed' && this.#options.allowPartial !== true) {
          break;
        }
      } catch (error) {
        events.push({
          kind: eventKind,
          runId,
          payload: {
            plugin: plugin.name,
            error: String(error),
            context,
          },
          trace,
        });

        if (this.#options.allowPartial !== true) {
          break;
        }
      }

      if (this.#options.timeoutMs != null && Date.now() - start > this.#options.timeoutMs) {
        await setTimeout(0);
      }
    }

    const elapsedMs = Date.now() - start;
    const timeline: ControlLabTimeline = {
      runId,
      durationMs: elapsedMs,
      events,
      stages: stageMap.map((plugin) => plugin.stage as ControlLabVerb),
      diagnostics: events.map((event) => event.trace),
    };

    return {
      runId,
      elapsedMs,
      blueprintId: blueprint.blueprintId,
      output: cursor,
      timeline,
      blueprint,
      diagnostics: {
        startedAt: new Date(start).toISOString(),
        runId,
        events,
      },
      finalOutput: [cursor] as unknown as PluginOutputChain<readonly ControlLabPlugin[]>,
    };
  }

  summarizePlugins(): readonly string[] {
    return this.#registry.topics();
  }

  domainProfile(): readonly [string, number][] {
    return Object.entries(this.#registry.countByDomain());
  }

  [Symbol.dispose](): void {
    this.#registry[Symbol.dispose]();
    this.#stack[Symbol.dispose]();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#stack[Symbol.asyncDispose]();
  }
}

export const executeControlLabRun = async <TPlugins extends readonly ControlLabPlugin[], TInput, TOutput>(
  plugins: TPlugins,
  blueprint: ControlLabBlueprint,
  context: Omit<ControlLabContext, 'runId' | 'pluginId'> & { signature: string },
  input: TInput,
  options?: ControlLabRuntimeOptions,
): Promise<LabRunOutput<TOutput>> => {
  await using lease = new RuntimeLease(plugins, options);
  const result = await lease.run<TInput>(blueprint, context, input);
  return {
    runId: result.runId,
    elapsedMs: result.elapsedMs,
    blueprintId: result.blueprintId,
    output: result.output as TOutput,
    timeline: result.timeline,
  };
};
