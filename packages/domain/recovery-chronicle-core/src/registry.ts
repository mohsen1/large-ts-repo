import { z } from 'zod';
import type { NoInfer } from '@shared/type-level';
import {
  asChroniclePluginId,
  asChroniclePhase,
  asChronicleRunId,
  asChronicleStepId,
  asChronicleTag,
  ChronicleAxis,
  ChronicleId,
  ChroniclePhase,
  ChroniclePhaseInput,
  ChroniclePhaseOutput,
  ChroniclePluginDescriptor,
  ChroniclePlanId,
  ChronicleRoute,
  ChronicleRunId,
  ChronicleStatus,
  ChronicleTenantId,
  asChroniclePlanId,
} from './types.js';

export interface ChronicleExecutionTrace {
  readonly id: ChronicleId;
  readonly runId: ChronicleRunId;
  readonly phases: readonly ChroniclePhase<string>[];
  readonly startedAt: number;
}

export interface ChroniclePluginEnvelope<TPluginInput = unknown, TPluginOutput = unknown> {
  readonly plugin: ChroniclePluginDescriptor<TPluginInput, TPluginOutput>;
  readonly phase: ChroniclePhase<string>;
  readonly order: number;
  readonly ready: boolean;
}

export interface RegistryFilter<TPhases extends readonly ChroniclePhase<string>[]> {
  readonly tenant: ChronicleTenantId;
  readonly phases: TPhases;
}

const brandAxis = <T extends string>(value: T): ChronicleAxis<T> => `axis:${value}` as ChronicleAxis<T>;

type PluginOutputSequence<TPlugins extends readonly ChroniclePluginDescriptor[]> = TPlugins extends readonly [infer Head, ...infer Tail]
  ? Head extends ChroniclePluginDescriptor<unknown, infer TOutput, unknown>
    ? [ChroniclePhaseOutput<TOutput>, ...PluginOutputSequence<Tail extends readonly ChroniclePluginDescriptor[] ? Tail : []>]
    : [ChroniclePhaseOutput<unknown>]
  : [];

export type PluginResultUnion<TPlugins extends readonly ChroniclePluginDescriptor[]> =
  PluginOutputSequence<TPlugins>[number] extends never
    ? ChroniclePhaseOutput<unknown>
    : PluginOutputSequence<TPlugins>[number];

type RegistryPhaseInput<TInput = unknown> = ChroniclePhaseInput<TInput> & { readonly plan?: ChroniclePlanId };

const uniqueByKey = <T>(items: readonly T[], key: (value: T) => PropertyKey): readonly T[] => {
  const seen = new Set<PropertyKey>();
  const output: T[] = [];
  for (const item of items) {
    const current = key(item);
    if (!seen.has(current)) {
      seen.add(current);
      output.push(item);
    }
  }
  return output;
};

export class ChroniclePluginRegistry<TPlugins extends readonly ChroniclePluginDescriptor[]> {
  readonly #plugins: Map<string, ChroniclePluginDescriptor>;
  readonly #ordered: readonly ChroniclePluginDescriptor[];
  readonly #phaseMap: Map<ChroniclePhase<string>, ChroniclePluginDescriptor[]>;
  readonly #trace: ChronicleExecutionTrace[];
  readonly #registry: readonly ChroniclePluginEnvelope[];
  readonly #registryState: ChroniclePluginEnvelope[];

  public constructor(plugins: TPlugins) {
    this.#ordered = [...plugins];
    this.#plugins = new Map(this.#ordered.map((plugin) => [plugin.id as string, plugin]));
    this.#phaseMap = new Map();
    this.#registryState = [];
    this.#trace = [];
    this.#registry = this.#registryState;

    for (const [index, plugin] of this.#ordered.entries()) {
      for (const phase of plugin.supports) {
        const phasePlugins = this.#phaseMap.get(phase) ?? [];
        this.#phaseMap.set(phase, [...phasePlugins, plugin]);
        this.#registryState.push({
          plugin,
          phase,
          order: index + 1,
          ready: true,
        });
      }
    }
  }

  public getPlugin(id: ChroniclePluginDescriptor['id'] | string): ChroniclePluginDescriptor | undefined {
    return this.#plugins.get(id as string);
  }

  public list(): readonly ChroniclePluginDescriptor[] {
    return [...this.#ordered];
  }

  public byPhase(phase: ChroniclePhase<string>): readonly ChroniclePluginDescriptor[] {
    return this.#phaseMap.get(phase) ?? [];
  }

  public getPhaseEnvelope(phase: ChroniclePhase<string>): readonly ChroniclePluginEnvelope[] {
    return this.#registry.filter((entry) => entry.phase === phase);
  }

  public runTrace(): readonly ChronicleExecutionTrace[] {
    return [...this.#trace];
  }

  public async *run<TInput>(
    start: NoInfer<TInput>,
    trace: ChronicleExecutionTrace,
  ): AsyncGenerator<PluginResultUnion<TPlugins>, PluginResultUnion<TPlugins>, void> {
    const phaseInput = start as RegistryPhaseInput<TInput>;
    const stack = new AsyncDisposableStack();
    const plugins = uniqueByKey(this.byPhase(phaseInput.phase), (plugin) => plugin.id);
    let working: unknown = phaseInput.payload;
    this.#trace.push(trace);

    try {
      for (const plugin of plugins) {
        const output = await plugin.process({
          ...phaseInput,
          payload: working,
        });
        working = output.payload;
        yield output as PluginResultUnion<TPlugins>;
      }
    } finally {
      await stack.disposeAsync();
    }

    return {
      stepId: phaseInput.stepId,
      runId: phaseInput.runId,
      status: 'succeeded',
      latencyMs: Math.max(1, Math.round(performance.now() - trace.startedAt)),
      score: Math.max(0, plugins.length * 3 + String(phaseInput.phase).length),
      payload: working,
    } as PluginResultUnion<TPlugins>;
  }

  public async runAll<TInput>(
    phaseInput: RegistryPhaseInput<TInput>,
    start: ChronicleExecutionTrace,
  ): Promise<ChroniclePhaseOutput<unknown>> {
    const results = this.run(phaseInput, start);
    let output: ChroniclePhaseOutput<unknown> = {
      stepId: phaseInput.stepId,
      runId: phaseInput.runId,
      status: 'queued',
      latencyMs: 0,
      score: 0,
      payload: phaseInput.payload,
    };
    for await (const item of results) {
      output = item as ChroniclePhaseOutput<unknown>;
    }
    return output;
  }
}

export type FilterPhases<T extends RegistryFilter<readonly ChroniclePhase<string>[]>> = T extends RegistryFilter<infer TPhases>
  ? TPhases
  : never;

export interface RegistryConfig {
  readonly namespace: ChronicleRoute;
  readonly revision: number;
  readonly tags: readonly ChronicleAxis[];
}

export const registryConfigSchema = z.object({
  namespace: z.string(),
  revision: z.number().int().nonnegative(),
  tags: z.array(z.string()),
});

export const parseRegistryConfig = (input: unknown): RegistryConfig => {
  const parsed = registryConfigSchema.parse(input);
  return {
    namespace: parsed.namespace as ChronicleRoute,
    revision: parsed.revision,
    tags: uniqueByKey(parsed.tags, (tag) => tag).map((tag) => brandAxis(tag)).toSorted((a, b) => a.localeCompare(b)),
  };
};

export const buildTrace = (runId: ChronicleRunId, pluginCount: number): ChronicleExecutionTrace => ({
  id: `${runId}:trace:${Date.now()}` as ChronicleId,
  runId,
  phases: [
    asChroniclePhase('bootstrap'),
    asChroniclePhase('execution'),
    asChroniclePhase('verification'),
  ],
  startedAt: Date.now(),
});

export const normalizeFilter = <TPhases extends readonly ChroniclePhase<string>[]>(
  tenant: ChronicleTenantId,
  ...phases: TPhases
): RegistryFilter<TPhases> => ({
  tenant,
  phases: phases as TPhases,
});

export const buildPhaseEnvelope = <TPhaseList extends readonly ChroniclePhase<string>[]>(
  phases: NoInfer<TPhaseList>,
): ChroniclePluginEnvelope[] => {
  const distinct = uniqueByKey(phases, (phase) => phase);
  return distinct.map((phase, index) => ({
    plugin: {
      id: asChroniclePluginId(`phase:${index}`),
      name: `phase:${index}`,
      version: '0.1.0',
      supports: [phase],
      state: { phase },
      process: async () => ({
        stepId: asChronicleStepId(`${index}:${phase}`),
        runId: asChronicleRunId(asChroniclePlanId(`tenant:${index}` as ChronicleTenantId, 'chronicle://registry')),
        status: 'running',
        latencyMs: 0,
        score: index,
        payload: {
          phase,
          timeline: [asChronicleTag('registry'), asChronicleTag('timeline'), 'control'],
        },
      }),
    },
    phase,
    order: index + 1,
    ready: true,
  }));
};

export const traceAxisLabels = <T extends readonly ChroniclePhase<string>[]>(
  phases: T,
): readonly PluginResultUnion<[]>[] =>
  phases.toSorted().map((phase, index) => {
    const plan = asChroniclePlanId(
      asChronicleTag('builder') as unknown as ChronicleTenantId,
      `chronicle://trace-${index}` as ChronicleRoute,
    );
    return {
      stepId: asChronicleStepId(`trace-${phase}`),
      runId: asChronicleRunId(plan),
      status: 'running',
      latencyMs: 5,
      score: index,
      payload: brandAxis(phase.slice('phase:'.length)),
    };
  });
