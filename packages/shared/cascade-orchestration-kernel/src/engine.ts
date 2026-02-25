import { makeCascadeId, makeEventRecord, type EventRecord } from './identity.js';
import { createRegistry } from './registry.js';
import type { PluginDefinition, PluginResultType } from './plugin-types.js';

export interface EngineOptions<TPlugins extends readonly PluginDefinition[]> {
  readonly runId: string;
  readonly tenantId: string;
  readonly plugins: TPlugins;
}

export interface EngineRun {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly runId: string;
  readonly events: EventRecord[];
  readonly outputs: Record<string, unknown>;
}

export interface DisposedEngine {
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

export class EngineLifecycle<TPlugins extends readonly PluginDefinition[]> implements DisposedEngine {
  #closed = false;

  constructor(private readonly options: EngineOptions<TPlugins>) {}

  async execute<T extends Record<string, unknown>>(input: T): Promise<EngineRun> {
    const startedAt = new Date().toISOString();
    const events: EventRecord[] = [];
    const output: Record<string, unknown> = {};

    const registry = createRegistry(this.options.plugins);
    const stack = new AsyncDisposableStack();

    try {
      stack.adopt(registry, (r) => r.dispose());

      for (const key of Object.keys(input)) {
        events.push(makeEventRecord('cascade:plugin-started', 'stage', makeCascadeId('stage', 'bootstrap'), {
          inputKey: key,
          tenant: this.options.tenantId,
        }));
      }

      const pluginOutputs = await registry.runAll(input as Record<string, unknown>) as Record<string, PluginResultType<TPlugins[number]>>;
      for (const [key, value] of Object.entries(pluginOutputs)) {
        output[key] = value;
      }

      events.push(makeEventRecord('cascade:run-complete', 'plan', makeCascadeId('plan', this.options.runId), {
        pluginCount: registry.list().length,
      }));

      return {
        startedAt,
        completedAt: new Date().toISOString(),
        runId: this.options.runId,
        events,
        outputs: output,
      };
    } finally {
      await stack.disposeAsync();
      this.#closed = true;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

export const withEngine = async <TPlugins extends readonly PluginDefinition[], TResult>(
  options: EngineOptions<TPlugins>,
  work: (engine: EngineLifecycle<TPlugins>) => Promise<TResult>,
): Promise<TResult> => {
  await using engine = new EngineLifecycle(options);
  return work(engine);
};

export const buildEngineRunSummary = (run: EngineRun): string => {
  const keys = Object.keys(run.outputs);
  return `${run.runId}:${keys.length} outputs (${run.startedAt} -> ${run.completedAt})`;
};
