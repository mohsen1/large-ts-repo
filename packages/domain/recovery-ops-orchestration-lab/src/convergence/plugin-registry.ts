import { z } from 'zod';
import type { DeepReadonly } from '@shared/type-level';
import type { NoInfer } from '@shared/type-level';
import type {
  ConvergenceAdapterContext,
  ConvergenceEnvelope,
  ConvergencePhase,
  ConvergencePluginConfig,
  ConvergencePluginDescriptor,
  ConvergencePluginId,
  ConvergenceRunId,
  ConvergenceWorkspaceId,
  PluginResult,
  PhaseSelector,
} from './types';

export interface ConvergencePluginEvent<
  TInput extends object = object,
  TContext extends object = object,
> {
  readonly phase: ConvergencePhase;
  readonly runId: ConvergenceRunId;
  readonly workspaceId: ConvergenceWorkspaceId;
  readonly context: ConvergenceAdapterContext & TContext;
  readonly input: TInput;
}

export interface ConvergencePluginDescriptorV2<
  TInput extends object = object,
  TOutput extends object = object,
  TContext extends object = object,
  TConfig extends ConvergencePluginConfig<string> = ConvergencePluginConfig<string>,
> extends ConvergencePluginDescriptor {
  readonly pluginConfig: TConfig;
  readonly execute: (
    event: ConvergencePluginEvent<TInput, TContext>,
  ) => Promise<PluginResult<TOutput>>;
  readonly adapt?: (
    event: ConvergencePluginEvent<TInput, TContext>,
    output: DeepReadonly<TOutput>,
  ) => DeepReadonly<TOutput>;
  readonly dispose?: (
    context: ConvergenceAdapterContext & TContext,
    output: ConvergenceEnvelope<DeepReadonly<TOutput>>,
  ) => Promise<void> | void;
}

export const pluginDescriptorSchema = z.object({
  id: z.string().min(6),
  label: z.string().min(1),
  stages: z.array(z.string()),
  dependencies: z.array(z.string()),
  config: z.object({
    profile: z.string(),
    tags: z.array(
      z.object({
        key: z.string(),
        value: z.string(),
      }),
    ),
    enabled: z.boolean(),
    metadata: z.record(z.unknown()).optional(),
  }),
  weight: z.number().nonnegative(),
});

const isConvergencePhase = (value: PhaseSelector): value is ConvergencePhase =>
  value === 'discover'
  || value === 'prioritize'
  || value === 'simulate'
  || value === 'rehearse'
  || value === 'verify'
  || value === 'close';

export const parsePluginPayload = (raw: unknown): raw is ConvergencePluginDescriptor =>
  pluginDescriptorSchema.safeParse(raw).success;

export interface ConvergencePluginLease {
  readonly pluginId: ConvergencePluginId;
  readonly removed: boolean;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

type PluginDescriptorStore = ConvergencePluginDescriptorV2<
  object,
  object,
  object,
  ConvergencePluginConfig<string>
>;

export class ConvergencePluginRegistry<
  const TPlugins extends readonly PluginDescriptorStore[],
> {
  private readonly plugins = new Map<string, PluginDescriptorStore>();
  private readonly phaseMap = new Map<ConvergencePhase, PluginDescriptorStore[]>();

  public constructor(plugins: TPlugins) {
    for (const plugin of plugins) {
      this.plugins.set(String(plugin.id), plugin);
      for (const stage of plugin.stages) {
        const bucket = this.phaseMap.get(stage) ?? [];
        bucket.push(plugin);
        bucket.sort((left, right) => right.weight - left.weight);
        this.phaseMap.set(stage, bucket);
      }
    }
  }

  public getPluginIds(): readonly ConvergencePluginId[] {
    return [...this.plugins.keys()].map((pluginId) => pluginId as ConvergencePluginId);
  }

  public has(pluginId: ConvergencePluginId): boolean {
    return this.plugins.has(String(pluginId));
  }

  public addPlugin(plugin: PluginDescriptorStore): ConvergencePluginLease {
    const key = String(plugin.id);
    const plugins = this.plugins;
    const phaseMap = this.phaseMap;

    if (this.plugins.has(key)) {
      throw new Error(`plugin already exists: ${key}`);
    }

    plugins.set(key, plugin);
    for (const stage of plugin.stages) {
      const bucket = phaseMap.get(stage) ?? [];
      bucket.push(plugin);
      bucket.sort((left, right) => right.weight - left.weight);
      phaseMap.set(stage, bucket);
    }

    let active = true;

    return {
      pluginId: plugin.id,
      removed: false,
      [Symbol.dispose](): void {
        if (!active) {
          return;
        }
        active = false;
        plugins.delete(key);
        for (const stage of plugin.stages) {
          const bucket = phaseMap.get(stage) ?? [];
          phaseMap.set(
            stage,
            bucket.filter((entry): entry is PluginDescriptorStore => String(entry.id) !== key),
          );
        }
      },
      async [Symbol.asyncDispose](): Promise<void> {
        this[Symbol.dispose]();
      },
    };
  }

  public candidatesForPhase<TPhase extends PhaseSelector>(phase: TPhase): readonly PluginDescriptorStore[] {
    if (isConvergencePhase(phase)) {
      return (this.phaseMap.get(phase) ?? []).slice();
    }

    return [...this.plugins.values()].filter((plugin): plugin is PluginDescriptorStore =>
      plugin.stages.includes(String(phase) as ConvergencePhase),
    );
  }

  public async runPhase<
    const TInput extends object,
    const TOutput extends object,
    const TContext extends ConvergenceAdapterContext,
  >(
    phase: ConvergencePhase,
    context: NoInfer<TContext>,
    input: NoInfer<TInput>,
    runId: ConvergenceRunId,
  ): Promise<readonly PluginResult<TOutput>[]> {
    const outputs: PluginResult<TOutput>[] = [];
    const disposers: Array<() => PromiseLike<void> | void> = [];
    const candidates = this.candidatesForPhase(phase);

    const asOutput = (value: unknown): DeepReadonly<TOutput> =>
      value as DeepReadonly<TOutput>;

    try {
      for (const candidate of candidates) {
        if (!candidate.config.enabled) {
          continue;
        }

        const started = performance.now();
        const event: ConvergencePluginEvent<TInput, TContext> = {
          phase,
          runId,
          workspaceId: context.workspaceId,
          context,
          input,
        };

        const output = (await candidate.execute(event)) as PluginResult<unknown>;
        const candidateOutput = output.output as DeepReadonly<TOutput>;
        const adapted = candidate.adapt
          ? candidate.adapt(event as never, candidateOutput)
          : candidateOutput;
        const normalized: PluginResult<TOutput> = {
          output: asOutput(adapted),
          events: output.events,
          trace: {
            ...output.trace,
            stage: phase,
            elapsedMs: Math.max(0, performance.now() - started),
            plugin: candidate.id,
          },
        };

        outputs.push(normalized);

        if (candidate.dispose) {
          const envelope: ConvergenceEnvelope<DeepReadonly<TOutput>> = {
            runId,
            timestamp: new Date().toISOString(),
            payload: asOutput(normalized.output) as never,
          };
          disposers.push(() => candidate.dispose?.(context, envelope));
        }
      }
    } finally {
      for (let index = disposers.length - 1; index >= 0; index -= 1) {
        await Promise.resolve(disposers[index]?.());
      }
    }

    return outputs;
  }

  public asSnapshot(): ReadonlyMap<string, ReadonlyArray<ConvergencePluginId>> {
    const snapshot = new Map<string, ConvergencePluginId[]>();
    for (const [phase, candidates] of this.phaseMap.entries()) {
      snapshot.set(phase, candidates.map((plugin) => plugin.id));
    }
    return snapshot;
  }
}

export const defineConvergencePlugins = <
  const TPlugins extends readonly PluginDescriptorStore[],
>(plugins: TPlugins): TPlugins => {
  const ids = plugins.map((plugin) => String(plugin.id));
  if (new Set(ids).size !== ids.length) {
    throw new Error('duplicate convergence plugin id detected');
  }
  return plugins;
};
