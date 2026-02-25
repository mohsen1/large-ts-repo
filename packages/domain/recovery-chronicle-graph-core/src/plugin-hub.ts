import {
  asChronicleGraphLane,
  asChronicleGraphPhase,
  asChronicleGraphRunId,
  asChronicleGraphTenantId,
  asChronicleGraphPlanId,
  type ChronicleGraphContext,
  type ChronicleGraphObservation,
  type ChronicleGraphPhase,
  type ChronicleGraphPlanId,
  type ChronicleGraphPluginDescriptor,
  type ChronicleGraphTenantId,
  type ChronicleGraphRoute,
  type ChronicleGraphTrace,
  type PluginResultUnion,
} from './identity.js';
import { type NoInfer } from '@shared/type-level';

export interface ChronicleGraphPluginEnvelope {
  readonly plugin: ChronicleGraphPluginDescriptor;
  readonly index: number;
  readonly phase: ChronicleGraphPhase;
  readonly active: boolean;
}

const toTimelineLane = (phase: ChronicleGraphPhase): `${string}` => asChronicleGraphLane(String(phase).replace('phase:', ''));

class PluginMonitor {
  readonly #events: ChronicleGraphObservation[] = [];
  readonly #pluginId: string;

  public constructor(pluginId: string) {
    this.#pluginId = pluginId;
  }

  public record(observation: ChronicleGraphObservation): void {
    this.#events.push(observation);
  }

  public get events(): readonly ChronicleGraphObservation[] {
    return this.#events;
  }

  public get pluginId(): string {
    return this.#pluginId;
  }

  [Symbol.dispose](): void {
    this.#events.length = 0;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#events.length = 0;
    await Promise.resolve(this.#pluginId);
  }
}

export interface PluginFactoryContext {
  readonly tenant: ChronicleGraphTenantId | string;
  readonly route: ChronicleGraphRoute;
  readonly runId: ReturnType<typeof asChronicleGraphRunId>;
}

export class ChronicleGraphPluginHub<TPlugins extends readonly ChronicleGraphPluginDescriptor[]> {
  readonly #plugins: readonly ChronicleGraphPluginDescriptor[];
  readonly #registry: Map<ChronicleGraphPluginDescriptor['id'], ChronicleGraphPluginDescriptor>;

  public constructor(plugins: NoInfer<TPlugins>) {
    this.#plugins = [...plugins];
    this.#registry = new Map(
      this.#plugins.map((plugin) => [plugin.id, plugin] as const),
    );
  }

  public list(): readonly ChronicleGraphPluginDescriptor[] {
    return this.#plugins.toSorted((left, right) => left.name.localeCompare(right.name));
  }

  public byId(id: ChronicleGraphPluginDescriptor['id']): ChronicleGraphPluginDescriptor | undefined {
    return this.#registry.get(id);
  }

  public phaseMap(): Map<ChronicleGraphPhase, ChronicleGraphPluginDescriptor[]> {
    const map = new Map<ChronicleGraphPhase, ChronicleGraphPluginDescriptor[]>();
    for (const plugin of this.#plugins) {
      for (const phase of plugin.supports) {
        map.set(phase, [...(map.get(phase) ?? []), plugin]);
      }
    }
    return map;
  }

  public phaseList(phase: ChronicleGraphPhase): readonly ChronicleGraphPluginDescriptor[] {
    return (this.phaseMap().get(phase) ?? []).toSorted((left, right) => left.version.localeCompare(right.version));
  }

  public asEnvelope(): ChronicleGraphPluginEnvelope[] {
    return this.#plugins.map((plugin, index) => ({
      plugin,
      index,
      phase: plugin.supports[0] ?? asChronicleGraphPhase('bootstrap'),
      active: true,
    }));
  }

  public async *run<TInput>(
    input: ChronicleGraphContext<{ readonly pluginInput: TInput }>,
    trace: ChronicleGraphTrace,
  ): AsyncGenerator<PluginResultUnion<TPlugins>> {
    const stack = new AsyncDisposableStack();
    let latest: unknown = input;

    try {
      for (const phase of trace.phases) {
        const phasePlugins = this.phaseList(phase);
        for (const plugin of phasePlugins) {
          const monitor = new PluginMonitor(plugin.id);
          stack.use(monitor);
          const next = await plugin.process({
            ...input,
            state: {
              ...(latest as Record<string, unknown>),
              pluginInput: latest,
            },
          });
          monitor.record(next);
          latest = next;
          yield next as PluginResultUnion<TPlugins>;
        }
      }
    } finally {
      await stack.disposeAsync();
    }
  }

  public async runAll<TInput>(
    input: ChronicleGraphContext<{ readonly pluginInput: TInput }>,
    trace: ChronicleGraphTrace,
  ): Promise<PluginResultUnion<TPlugins>> {
    const stack = new AsyncDisposableStack();
    let latest: unknown = input;

    try {
      for (const phase of trace.phases) {
        for (const plugin of this.phaseList(phase)) {
          const monitor = new PluginMonitor(plugin.id);
          stack.use(monitor);
          const next = await plugin.process({
            ...input,
            state: {
              ...(latest as Record<string, unknown>),
              pluginInput: latest,
            },
          });
          monitor.record(next);
          latest = next;
        }
      }
    } finally {
      await stack.disposeAsync();
    }

    return latest as PluginResultUnion<TPlugins>;
  }
}

export const createHub = <TPlugins extends readonly ChronicleGraphPluginDescriptor[]>(
  plugins: NoInfer<TPlugins>,
): ChronicleGraphPluginHub<TPlugins> => new ChronicleGraphPluginHub(plugins);

export const asPluginEnvelope = (hub: ChronicleGraphPluginHub<readonly ChronicleGraphPluginDescriptor[]>): ChronicleGraphPluginEnvelope[] =>
  hub.asEnvelope();

export const makePhaseTrace = (
  tenant: PluginFactoryContext['tenant'],
  route: ChronicleGraphRoute,
  plugins: readonly ChronicleGraphPluginDescriptor[],
  phases: readonly ChronicleGraphPhase[],
): ChronicleGraphTrace => {
  const tenantId = (typeof tenant === 'string' && tenant.startsWith('tenant:'))
    ? (tenant as ChronicleGraphTenantId)
    : asChronicleGraphTenantId(String(tenant));
  const _plan: ChronicleGraphPlanId = asChronicleGraphPlanId(`plan:${route}`);

  return {
    id: asChronicleGraphRunId(tenantId, route),
    tenant: tenantId,
    plan: _plan,
    phases,
    startedAt: Date.now(),
  };
};

export const describeHub = (
  hub: ChronicleGraphPluginHub<readonly ChronicleGraphPluginDescriptor[]>,
): readonly string[] => {
  return hub.list().map((plugin) =>
    `${plugin.id}:${toTimelineLane(plugin.supports[0] ?? asChronicleGraphPhase('bootstrap'))}`,
  );
};
