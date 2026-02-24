import { z } from 'zod';

import type {
  ConstellationArtifact,
  ConstellationExecutionResult,
  ConstellationOrchestrationPlan,
  ConstellationPluginContextState,
  ConstellationPluginEvent,
  ConstellationSignalEnvelope,
  ConstellationStage,
  ConstellationStageId,
  ConstellationWindow,
} from './command-constellation-types';
import type { CommandPlan } from './types';

const pluginManifestSchema = z.object({
  id: z.string().min(1),
  phase: z.enum(['scan', 'plan', 'simulate', 'execute', 'review']),
  event: z.enum([
    'constellation:event:scan',
    'constellation:event:plan',
    'constellation:event:simulate',
    'constellation:event:execute',
    'constellation:event:review',
    'constellation:event:rollback',
    'constellation:event:alert',
  ]),
  order: z.number().int().min(0),
  labels: z.array(z.string()),
});

export interface ConstellationPluginManifest {
  readonly id: string;
  readonly phase: 'scan' | 'plan' | 'simulate' | 'execute' | 'review';
  readonly event: ConstellationPluginEvent;
  readonly order: number;
  readonly labels: readonly string[];
}

export type ConstellationPlugin<TPayload = Record<string, unknown>, TState = Record<string, never>> = {
  readonly id: string;
  readonly phase: 'scan' | 'plan' | 'simulate' | 'execute' | 'review';
  readonly event: ConstellationPluginEvent;
  readonly order: number;
  readonly labels: readonly string[];
  readonly inputSchema: z.ZodType<TPayload>;
  run(context: ConstellationPluginContext<TState>, input: TPayload): Promise<unknown>;
};

export interface ConstellationPluginContext<TState = Record<string, never>> {
  readonly tenant: ConstellationPluginContextState['tenant'];
  readonly runId: ConstellationPluginContextState['plan']['runId'];
  readonly phase: ConstellationPluginContextState['plan']['phase'];
  readonly state: TState;
  readonly trace: readonly string[];
  readonly run: () => Promise<void>;
  emit(event: ConstellationPluginEvent, payload: Record<string, unknown>): ConstellationSignalEnvelope;
}

export interface ConstellationRunReport {
  readonly artifacts: readonly ConstellationArtifact[];
  readonly plans: readonly CommandPlan[];
  readonly stages: readonly ConstellationStage[];
  readonly windows: readonly ConstellationWindow[];
  readonly signals: readonly ConstellationSignalEnvelope[];
}

export interface ConstellationRunSummary {
  readonly events: readonly ConstellationSignalEnvelope[];
  readonly outputs: readonly unknown[];
}

const normalizeManifest = (raw: {
  readonly id: string;
  readonly phase: ConstellationPluginManifest['phase'];
  readonly event: ConstellationPluginManifest['event'];
  readonly order: number;
  readonly labels: readonly string[];
}) => ({
  id: raw.id,
  phase: raw.phase,
  event: raw.event as ConstellationPluginEvent,
  order: raw.order,
  labels: [...raw.labels],
});

const pluginDefaults = (
  [
    {
      id: 'detect-baseline',
      phase: 'scan',
      event: 'constellation:event:scan',
      order: 10,
      labels: ['seed', 'detector'],
    },
    {
      id: 'plan-optimize',
      phase: 'plan',
      event: 'constellation:event:plan',
      order: 20,
      labels: ['planner'],
    },
    {
      id: 'simulate-risk',
      phase: 'simulate',
      event: 'constellation:event:simulate',
      order: 30,
      labels: ['sim', 'risk'],
    },
    {
      id: 'execute-safe-mode',
      phase: 'execute',
      event: 'constellation:event:execute',
      order: 40,
      labels: ['executor'],
    },
    {
      id: 'review-safe-state',
      phase: 'review',
      event: 'constellation:event:review',
      order: 50,
      labels: ['reviewer'],
    },
  ] as const
)
  .map((manifest) => pluginManifestSchema.parse(manifest))
  .map(normalizeManifest) as readonly ConstellationPluginManifest[];

export const defaultManifestTuples = pluginDefaults
  .map((manifest) => [manifest.id, manifest] as const)
  .reduce<Record<string, ConstellationPluginManifest>>(
    (acc, [id, manifest]) => ({
      ...acc,
      [id]: manifest,
    }),
    {} as Record<string, ConstellationPluginManifest>,
  );

const bootstrapPlugin = <TPayload extends Record<string, unknown>, TState>(
  plugin: ConstellationPlugin<TPayload, TState>,
): ConstellationPlugin<TPayload, TState> => plugin;

export class ConstellationDisposalScope {
  #disposers: Array<() => Promise<void> | void> = [];

  [Symbol.dispose](): void {
    this.#disposers = [];
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const disposer of [...this.#disposers].reverse()) {
      await disposer();
    }
    this.#disposers = [];
  }

  use<T extends { [Symbol.asyncDispose]?: () => Promise<void>; [Symbol.dispose]?: () => void }>(resource: T): T {
    if (typeof resource[Symbol.asyncDispose] === 'function') {
      this.#disposers.push(() => resource[Symbol.asyncDispose]?.());
    } else if (typeof resource[Symbol.dispose] === 'function') {
      this.#disposers.push(() => resource[Symbol.dispose]?.());
    }
    return resource;
  }
}

type EventManifestMap = Partial<Record<ConstellationPluginEvent, readonly ConstellationPlugin[]>>;

export class ConstellationPluginRegistry<TPlugins extends readonly ConstellationPlugin[]> {
  readonly #manifests: EventManifestMap = {};
  readonly #plugins: ReadonlyArray<TPlugins[number]>;
  readonly #index: Record<string, TPlugins[number]>;

  constructor(plugins: TPlugins) {
    const buckets = new Map<ConstellationPluginEvent, ConstellationPlugin[]>();
    this.#index = {};

    for (const plugin of plugins) {
      const key = plugin.id;
      const eventBucket = buckets.get(plugin.event) ?? [];
      eventBucket.push(plugin);
      buckets.set(plugin.event, eventBucket);
      this.#index[key] = plugin;
    }

    for (const bucket of buckets.values()) {
      bucket.sort((left, right) => left.order - right.order);
    }

    this.#manifests = Object.fromEntries(
      [...buckets.entries()].map(([event, plugins]) => [event, plugins] as const),
    ) as EventManifestMap;
    this.#plugins = [...plugins];
  }

  getPlugin<TId extends TPlugins[number]['id']>(id: TId): Extract<TPlugins[number], { id: TId }> | undefined {
    return this.#index[id] as Extract<TPlugins[number], { id: TId }> | undefined;
  }

  get plugins(): ReadonlyArray<TPlugins[number]> {
    return this.#plugins;
  }

  async runEvent<TEvent extends ConstellationPluginEvent, TState>(
    context: ConstellationPluginContext<TState>,
    event: TEvent,
    payload: Record<string, unknown>,
  ): Promise<ConstellationRunSummary> {
    const plugins = this.#manifests[event] ?? [];
    const outputs: unknown[] = [];
    const events: ConstellationSignalEnvelope[] = [];
    using _scope = new ConstellationDisposalScope();

    for (const plugin of plugins) {
      const typedPlugin = plugin as ConstellationPlugin<Record<string, unknown>, typeof context.state>;
      const parsed = typedPlugin.inputSchema.parse({
        type: event,
        payload,
        priority: typedPlugin.order,
      });
      const output = await typedPlugin.run(context, parsed as Record<string, unknown>);
      outputs.push(output);
      events.push(
        context.emit(event, {
          plugin: typedPlugin.id,
          output: plugin.labels,
          outputType: parsed.type ?? 'unknown',
        }),
      );
    }

    return { events, outputs };
  }

  async simulate(plan: ConstellationOrchestrationPlan): Promise<ConstellationRunReport> {
    const commandIds = plan.commands.map((command) => command.id);
    const artifacts: ConstellationArtifact[] = commandIds.map((commandId, index) => ({
      id: `artifact:${plan.id}:${commandId}` as ConstellationArtifact['id'],
      name: `Plan artifact for ${commandId}`,
      generatedAt: new Date().toISOString(),
      stageId: plan.stages[index]?.id ?? ('seed-stage' as ConstellationStageId),
      score: Math.min(1, 0.2 + index / Math.max(1, plan.stages.length)),
      tags: ['simulated', commandId],
    }));

    const stages = plan.stages.filter((stage, index) => index % 2 === 0).slice();
    const windows = plan.windows.slice();
    return {
      artifacts,
      plans: [],
      stages,
      windows,
      signals: [],
    };
  }
}

const toCommandOutput = (plugin: ConstellationPluginManifest): ConstellationPlugin => ({
  ...plugin,
  inputSchema: z.object({
    type: z.string().min(1),
    payload: z.record(z.unknown()),
    priority: z.number().int().min(0).max(100).default(plugin.order),
  }),
  async run(context, input) {
    return {
      manifest: plugin,
      contextPhase: context.phase,
      observedAt: new Date().toISOString(),
      plugin: plugin.labels.join(','),
      input,
      trace: context.trace,
    };
  },
});

export const seedPluginCatalog = async (): Promise<readonly ConstellationPlugin[]> => {
  const plugins = pluginDefaults.map((manifest) => bootstrapPlugin(toCommandOutput(manifest)));
  return plugins.sort((left, right) => left.order - right.order);
};

export const seedPlugins = seedPluginCatalog();
