import {
  buildTopologySpec,
  detectCycles,
  type PluginManifest,
  type PluginManifestId,
  type PluginRoute,
  type PluginStage,
  pluginStages,
} from '@domain/recovery-incident-lab-core';
import { RecoveryPluginRegistryStore, pluginCatalogSeeds } from '@data/recovery-horizon-store';

export type OrchestrationMode = 'adaptive' | 'strict' | 'manual';

export interface PluginOrchestrationInput<TInput = unknown> {
  readonly tenantId: string;
  readonly runId: string;
  readonly namespace: string;
  readonly manifestInputs: readonly PluginManifest[];
  readonly route: PluginRoute;
  readonly input: TInput;
  readonly mode: OrchestrationMode;
}

export interface PluginExecutionStep<TInput = unknown, TOutput = unknown> {
  readonly manifestId: PluginManifestId;
  readonly stage: PluginStage;
  readonly manifestKind: string;
  readonly input: TInput;
  output?: TOutput;
  readonly startedAt: string;
  finishedAt?: string;
  readonly ok: boolean;
}

export interface PluginOrchestrationPlan {
  readonly tenantId: string;
  readonly runId: string;
  readonly namespace: string;
  readonly specs: number;
  readonly edges: number;
  readonly timeline: readonly string[];
}

export interface PluginExecutionReport<TInput = unknown, TOutput = unknown> {
  readonly plan: PluginOrchestrationPlan;
  readonly steps: readonly PluginExecutionStep<TInput, TOutput>[];
  readonly snapshots: readonly string[];
}

const normalizeMode = (mode: OrchestrationMode): number =>
  mode === 'strict' ? 3 : mode === 'adaptive' ? 2 : 1;

const emitLog = (runId: string, manifest: PluginManifest) => `${runId}/${manifest.kind}/${manifest.id}` as const;

const delayStep = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const toArray = async <T>(values: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const value of values) {
    out.push(value);
  }
  return out;
};

export class PluginOrchestrationService {
  readonly #store: RecoveryPluginRegistryStore;

  constructor() {
    this.#store = new RecoveryPluginRegistryStore(pluginCatalogSeeds);
  }

  async hydrateSeed(): Promise<number> {
    let hydrated = 0;
    for await (const _seed of this.#store.scan()) {
      hydrated += 1;
    }
    return hydrated;
  }

  async buildPlan(input: PluginOrchestrationInput): Promise<PluginOrchestrationPlan> {
    const topology = buildTopologySpec(input.namespace, input.manifestInputs);
    const cycles = detectCycles(topology.nodes);
    return {
      tenantId: input.tenantId,
      runId: input.runId,
      namespace: input.namespace,
      specs: topology.nodes.length,
      edges: topology.edges.length,
      timeline: cycles,
    };
  }

  async *execute<TInput = unknown, TOutput = unknown>(
    input: PluginOrchestrationInput<TInput>,
  ): AsyncGenerator<PluginExecutionReport<TInput, TOutput>> {
    const topology = buildTopologySpec(input.namespace, input.manifestInputs);
    const cycles = detectCycles(topology.nodes);
    const plan: PluginOrchestrationPlan = {
      tenantId: input.tenantId,
      runId: input.runId,
      namespace: input.namespace,
      specs: topology.nodes.length,
      edges: topology.edges.length,
      timeline: cycles,
    };

    const steps: PluginExecutionStep<TInput, TOutput>[] = [];
    await using executionScope = new AsyncDisposableStack();

    for (const node of topology.nodes) {
      const manifest = node.manifest;
      const stage = node.stage ?? pluginStages[0];
      const startedAt = new Date().toISOString();
      await delayStep(normalizeMode(input.mode) * 5);

      const step: PluginExecutionStep<TInput, TOutput> = {
        manifestId: manifest.id,
        stage,
        manifestKind: manifest.kind,
        input: input.input,
        startedAt,
        ok: true,
      };

      executionScope.defer(async () => {
        step.finishedAt = new Date().toISOString();
        step.output = {
          ...(input.input as unknown as Record<string, unknown>),
        } as TOutput;
      });
      steps.push(step);
    }

    const report: PluginExecutionReport<TInput, TOutput> = {
      plan,
      steps,
      snapshots: topology.nodes.map((node) => emitLog(input.runId, node.manifest)),
    };
    yield report;
  }

  async discoverSnapshots(input: PluginOrchestrationInput): Promise<readonly string[]> {
    const records = await this.#store.list({
      kinds: input.manifestInputs.map((manifest) => manifest.kind),
      prefix: input.namespace,
    });
    if (!records.ok) {
      return [];
    }

    const values = await toArray(this.#store.scan());
    const names = values.map((entry) => `${entry.manifest.id}`);
    const suffixes = await toArray((async function* suffixes() {
      for (const value of names) {
        yield value;
      }
    })());

    return [...new Set([...names, ...suffixes])];
  }
}

export const createOrchestrationService = (): PluginOrchestrationService => new PluginOrchestrationService();
