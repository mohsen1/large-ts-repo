import type { NoInfer } from '@shared/type-level';
import type { PluginDefinition } from './types';
import type { ExperimentPhase, ExperimentIntent } from '@domain/recovery-autonomy-experiment';
import type { SchedulerRunId } from './types';

export interface RegistryEvents {
  readonly registered: (id: string) => void;
  readonly run: (phase: string) => void;
}

export class PluginRegistry<TPlugins extends readonly PluginDefinition[] = readonly PluginDefinition[]> {
  readonly #plugins = new Map<string, PluginDefinition>();
  readonly #events: RegistryEvents;

  constructor(events: RegistryEvents) {
    this.#events = events;
  }

  register<TPlugin extends PluginDefinition>(plugin: TPlugin): PluginRegistry<readonly [...TPlugins, TPlugin]> {
    this.#plugins.set(`${plugin.id}`, plugin);
    this.#events.registered(`${plugin.id}`);
    return this as never;
  }

  byPhase(phase: ExperimentPhase | string): readonly PluginDefinition[] {
    return [...this.#plugins.values()]
      .filter((entry) => entry.phase === phase)
      .toSorted((left, right) => right.priority - left.priority);
  }

  byKind(kind: string): PluginDefinition | undefined {
    return this.#plugins.get(kind);
  }

  async run<TInput, TOutput>(
    phase: string,
    input: NoInfer<TInput>,
    context: { readonly runId: SchedulerRunId },
    intent: ExperimentIntent,
  ): Promise<readonly TOutput[]> {
    const plugins = this.byPhase(phase);
    const outputs: TOutput[] = [];

    for (const plugin of plugins) {
      const output = await plugin.transform(input as never, {
        runId: context.runId,
        tenant: `${intent.tenantId}`,
        phase: plugin.phase,
        correlation: `corr:${intent.runId}`,
      });
      outputs.push(output as TOutput);
      this.#events.run(phase);
    }

    return outputs;
  }

  size(): number {
    return this.#plugins.size;
  }
}

export const createDefaultRegistry = (): PluginRegistry =>
  new PluginRegistry({
    registered: () => {},
    run: () => {},
  });
