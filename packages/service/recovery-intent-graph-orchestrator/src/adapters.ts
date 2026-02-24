import {
  createNodeId,
  createOutputWithPayload,
  type IntentExecutionContext,
  type IntentNodePayload,
  type IntentStage,
  type PluginContract,
} from '@domain/recovery-intent-graph';
import type { AdapterRegistry } from './types';

export interface AdapterProfile {
  readonly stage: IntentStage;
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
}

export class InProcessAdapterRegistry implements AdapterRegistry {
  readonly #profiles = new Map<IntentStage, AdapterProfile[]>();
  readonly #plugins = new Map<IntentStage, PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>();

  register(plugin: PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>): void {
    const stage = plugin.kind;
    const profile = {
      stage,
      id: plugin.pluginId,
      name: plugin.pluginId,
      available: true,
    };
    this.#profiles.set(stage, [profile, ...(this.#profiles.get(stage) ?? [])]);

    const list = this.#plugins.get(stage) ?? [];
    this.#plugins.set(stage, [plugin, ...list]);
  }

  resolve<TKind extends IntentStage>(stage: TKind): readonly PluginContract<TKind, IntentNodePayload, IntentNodePayload>[] {
    const sorted = [...(this.#plugins.get(stage) ?? [])]
      .filter((plugin): plugin is PluginContract<TKind, IntentNodePayload, IntentNodePayload> => plugin.kind === stage)
      .toSorted((left, right) => right.weight - left.weight);
    return sorted as readonly PluginContract<TKind, IntentNodePayload, IntentNodePayload>[];
  }

  registerForStage(
    stage: IntentStage,
    plugin: PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>,
  ): void {
    this.register(plugin);
  }

  get diagnostics(): readonly { stage: IntentStage; count: number }[] {
    return [...this.#profiles.values()].flatMap((profiles) => profiles.map((profile) => ({ stage: profile.stage, count: profiles.length })));
  }

  get profileTuples(): readonly [IntentStage, AdapterProfile[]][] {
    return [...this.#profiles.entries()] as readonly [IntentStage, AdapterProfile[]][];
  }
}

export const buildDefaultRegistry = (): InProcessAdapterRegistry => {
  const registry = new InProcessAdapterRegistry();
  const stages = ['capture', 'normalize', 'score', 'recommend', 'simulate', 'resolve'] as const;

  for (const stage of stages) {
    const plugin: PluginContract<IntentStage, IntentNodePayload, IntentNodePayload> = {
      kind: stage,
      pluginId: `plugin:${stage}:default-v1` as PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>['pluginId'],
      capability: [`ws://intent.stage/${stage}`],
      weight: 100,
      config: {
        source: 'recovery-intent-graph-orchestrator',
        stage,
      },
      run: async (context: IntentExecutionContext<IntentNodePayload>) => {
        const output = createOutputWithPayload(
          {
            input: context.input,
            nodeId: createNodeId(context.node.graphId, `${stage}-${context.node.nodeId}`),
            payload: context.payload,
            recommendations: [String(context.payload.kind)],
          },
          100,
          Math.max(1, context.node.timeoutMs / 2),
        );
        if (output.ok) {
          return output;
        }
        return output;
      },
    };
    registry.register(plugin);
  }

  return registry;
};

export interface AdapterProfileCatalog {
  readonly profileTuples: readonly [IntentStage, AdapterProfile[]][];
}

export const toAdapterNames = (registry: AdapterProfileCatalog): readonly string[] => {
  const iterator = (globalThis as {
    readonly Iterator?: {
      readonly from?: <T>(values: Iterable<T>) => {
        map<U>(transform: (value: T) => U): { toArray: () => U[] };
        toArray: () => T[];
      };
    };
  }).Iterator;
  const raw = registry.profileTuples.flatMap(([stage, profiles]) => profiles.map((profile) => `${stage}:${profile.id}`));
  return iterator?.from?.(raw)?.toArray() ?? raw;
};
