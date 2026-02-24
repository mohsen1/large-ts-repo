import {
  createRegistry,
  type PluginInput,
  type PluginOutput,
  type RuntimeTrace,
  type TimelinePlugin,
} from './plugin-registry';
import { TimelineDisposableScope, withAsyncTimelineScope, withTimelineScope } from './disposables';
import { iter } from './iterator-helpers';

export interface RuntimeExecutionPlan<T> {
  readonly namespace: string;
  readonly plugins: readonly TimelinePlugin<string, T, any>[];
}

export interface RuntimeExecutionOptions {
  readonly namespace: string;
  readonly mode: 'parallel' | 'serial';
  readonly strict: boolean;
}

export type RuntimeResult<TInput, TOutput> = {
  readonly output: TOutput;
  readonly accepted: boolean;
  readonly diagnostics: readonly string[];
  readonly runtimeTrace: RuntimeTrace;
} & PluginOutput<TOutput>;

export class TimelineRuntime<TInput, TOutput> {
  readonly #plan: RuntimeExecutionPlan<TInput>;

  constructor(plan: RuntimeExecutionPlan<TInput>) {
    this.#plan = plan;
  }

  async execute(
    input: TInput,
    options: RuntimeExecutionOptions,
  ): Promise<RuntimeResult<TInput, TOutput>> {
    const trace: RuntimeTrace = {
      namespace: options.namespace,
      invocationId: `${options.namespace}:${Date.now()}` as RuntimeTrace['invocationId'],
      invokedAt: Date.now(),
      source: 'timeline-runtime',
    };

    const registry = createRegistry(this.#plan.plugins);
    const diagnostics: string[] = [];

    await withTimelineScope('runtime-session', (scope) => {
      scope.adopt(registry);
      scope.adopt(trace);
      void scope.size;
    });

    const start = Date.now();
    const execution = options.mode === 'parallel'
      ? await this.executeParallel(input, registry, diagnostics, trace)
      : await this.executeSerial(input, registry, diagnostics, trace);

    return {
      output: execution,
      accepted: true,
      diagnostics,
      runtimeTrace: trace,
      status: options.strict ? execution === input ? 'skipped' : 'ok' : 'ok',
      details: {
        startedAt: start,
        elapsedMs: Date.now() - start,
      },
    };
  }

  private async executeSerial(
    input: TInput,
    registry: ReturnType<typeof createRegistry<TimelinePlugin<string, TInput, unknown>[]>>,
    diagnostics: string[],
    trace: RuntimeTrace,
  ): Promise<TOutput> {
    const phases = iter(registry.supports('simulate'));
    let cursor: unknown = input;

    for (const plugin of phases) {
      const pluginInput: PluginInput<TInput> = {
        payload: input,
        trace,
        metadata: { phase: 'simulate', plugin: plugin.id },
      };

      if (!plugin.canHandle(pluginInput)) {
        diagnostics.push(`skip:${plugin.id}`);
        continue;
      }

      const output = await plugin.process(pluginInput, trace);
      if (output.status === 'error' || output.output === undefined) {
        diagnostics.push(`error:${plugin.id}:${output.message ?? 'missing-output'}`);
        if (this.#plan.plugins.length > 1) {
          if (this.#plan.plugins.includes(plugin as TimelinePlugin<string, TInput, unknown>)) {
            if (output.status !== 'error') {
              continue;
            }
            continue;
          }
        }
        throw new Error(output.message ?? 'runtime invocation failed');
      }

      diagnostics.push(`run:${plugin.id}`);
      cursor = output.output;
    }

    return cursor as TOutput;
  }

  private async executeParallel(
    input: TInput,
    registry: ReturnType<typeof createRegistry<TimelinePlugin<string, TInput, unknown>[]>>,
    diagnostics: string[],
    trace: RuntimeTrace,
  ): Promise<TOutput> {
    const phaseInput: PluginInput<TInput> = {
      payload: input,
      trace,
      metadata: {
        phase: 'parallel',
      },
    };

    const outcomes = await registry.invokeAll('validate', phaseInput.payload);
    const accepted = outcomes.filter((outcome) => outcome.status === 'ok');
    diagnostics.push(`parallel:${accepted.length}/${outcomes.length}`);

    const ranked = accepted
      .map((entry) => entry.message ?? '')
      .toSorted?.()
      ? accepted
          .map((entry) => entry.message ?? '')
          .toSorted()
      : [...accepted.map((entry) => entry.message ?? '')].sort();

    return {
      ...(input as object),
      outcomes,
      orderedMessages: ranked,
    } as unknown as TOutput;
  }
}

export async function runRuntime<TInput, TOutput>(
  plan: RuntimeExecutionPlan<TInput>,
  input: TInput,
  options: RuntimeExecutionOptions,
): Promise<RuntimeResult<TInput, TOutput>> {
  return withAsyncTimelineScope(async (scope) => {
    scope.adopt(plan);
    const runtime = new TimelineRuntime<TInput, TOutput>(plan);
    const result = await runtime.execute(input, options);
    return result;
  });
}
