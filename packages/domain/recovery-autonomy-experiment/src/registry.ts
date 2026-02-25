import { Brand, withBrand } from '@shared/core';
import type { NoInfer } from '@shared/type-level';
import type {
  ExperimentContext,
  ExperimentPhase,
  ExperimentIntent,
  RuntimeResult,
  RuntimeEvent,
  ExperimentRunId,
} from './types';

export type PluginKind<TPhase extends ExperimentPhase = ExperimentPhase> = Brand<`plugin:${TPhase}`, 'PluginKind'>;
export type PluginId = Brand<string, 'PluginId'>;

export interface PluginContract<TInput = unknown, TOutput = unknown, TPhase extends ExperimentPhase = ExperimentPhase> {
  readonly id: PluginId;
  readonly kind: PluginKind<TPhase>;
  readonly phase: TPhase;
  readonly priority: number;
  readonly transform: (input: NoInfer<TInput>, context: NoInfer<PluginContext>) => Promise<NoInfer<TOutput>>;
}

export interface PluginContext {
  readonly runId: ExperimentRunId;
  readonly tenant: string;
  readonly phase: ExperimentPhase;
  readonly correlation: string;
}

export type PluginOutcomeMap<T extends readonly PluginContract[]> = {
  [P in keyof T as T[P] extends PluginContract<infer _TInput, unknown, infer TPhase> ? `phase:${TPhase & string}` : never]:
    T[P] extends PluginContract<infer _TInput, infer _TOutput>
      ? (input: NoInfer<_TInput>) => Promise<_TOutput>
      : never;
};

export interface RegistryStats {
  readonly totalRegistered: number;
  readonly perPhase: Readonly<Record<ExperimentPhase, number>>;
}

export class ExperimentRegistry<TPlugins extends readonly PluginContract[] = readonly PluginContract[]> {
  readonly #plugins = new Map<string, PluginContract>();

  register<TPlugin extends PluginContract>(plugin: TPlugin): ExperimentRegistry<readonly [...TPlugins, TPlugin]> {
    this.#plugins.set(plugin.id, {
      ...plugin,
      id: withBrand(plugin.id, 'PluginId'),
    } as PluginContract);
    return this as never;
  }

  byPhase(phase: ExperimentPhase): readonly PluginContract[] {
    return [...this.#plugins.values()]
      .filter((entry) => entry.phase === phase)
      .toSorted((left, right) => right.priority - left.priority);
  }

  byKind(kind: string): PluginContract | undefined {
    return this.#plugins.get(kind);
  }

  async runPhase<TInput, TOutput>(
    phase: ExperimentPhase,
    input: NoInfer<TInput>,
    context: PluginContext,
    intent: ExperimentIntent,
  ): Promise<RuntimeResult<TOutput>> {
    const activePlugins = this.byPhase(phase);
    const outputs: RuntimeEvent<TOutput>[] = [];

    await using stack = new AsyncDisposableStack();

    for (const plugin of activePlugins) {
      const output = (await plugin.transform(input as never, context)) as TOutput;
      const resource = {
        id: plugin.id,
        value: output,
        [Symbol.asyncDispose]: async () => {
          await Promise.resolve();
        },
      } satisfies { id: string; value: unknown; [Symbol.asyncDispose](): Promise<void> };
      stack.use(resource);
      outputs.push({
        phase,
        output,
        recordedAt: new Date().toISOString(),
        runId: context.runId,
      });
    }

    await stack[Symbol.asyncDispose]();

    return {
      runId: context.runId,
      outputs,
      state: {
        phase,
        sequenceProgress: outputs.map((entry, index) => index),
        complete: intent.phase === phase,
      },
    };
  }

  telemetry(): RegistryStats {
    const initial = {
      totalRegistered: this.#plugins.size,
      perPhase: {
        prepare: 0,
        inject: 0,
        observe: 0,
        adapt: 0,
        recover: 0,
        verify: 0,
      } as Record<ExperimentPhase, number>,
    };

    for (const plugin of this.#plugins.values()) {
      initial.perPhase[plugin.phase] += 1;
    }

    return initial;
  }

  size(): number {
    return this.#plugins.size;
  }
}

export const normalizePluginId = <T extends string>(value: T): PluginId => withBrand(value, 'PluginId');
export const buildPlugin = <TInput, TOutput, TPhase extends ExperimentPhase>(
  input: Omit<PluginContract<TInput, TOutput, TPhase>, 'id'> & { readonly id: string; readonly phase: TPhase },
): PluginContract<TInput, TOutput, TPhase> => ({
  ...input,
  id: withBrand(input.id, 'PluginId'),
  kind: withBrand(`plugin:${input.phase}`, 'PluginKind'),
});

export const createRegistry = (): ExperimentRegistry => new ExperimentRegistry();
