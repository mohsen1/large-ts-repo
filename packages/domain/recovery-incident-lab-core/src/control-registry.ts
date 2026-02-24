import { canonicalizeNamespace } from '@shared/stress-lab-runtime';
import {
  buildPluginDefinition,
  collectPluginEvents,
  executePluginChain,
  type CompatibleChain,
  type PluginContext,
  type PluginDefinition,
  type PluginEvent,
  type PluginKind,
  type PluginNamespace,
} from '@shared/stress-lab-runtime';
import {
  buildControlEventName,
  createControlRunId,
  type ControlEvent,
  type ControlRunId,
  type ControlTimelineBucket,
  type ControlStage,
  type ControlScope,
  controlKinds,
  controlStages,
} from './control-orchestration-types';

export interface ControlRegistryOptions {
  readonly namespace: string;
  readonly namespaceVersion: `${number}.${number}.${number}`;
  readonly stageOrder?: readonly ControlStage[];
}

export interface RegistryManifest {
  readonly namespace: string;
  readonly namespaceVersion: string;
  readonly pluginCount: number;
  readonly stageCount: number;
  readonly pluginKinds: readonly PluginKind[];
}

export interface ControlPluginExecution<TOutput> {
  readonly stage: ControlStage;
  readonly event: ControlEvent;
  readonly output: TOutput;
}

export interface ControlRegistryResult<TOutput> {
  readonly output: TOutput;
  readonly diagnostics: readonly string[];
  readonly score: number;
  readonly runId: ControlRunId;
  readonly generatedAt: string;
}

const scopeForKind = (kind: string): ControlScope => {
  if (kind.startsWith('recovery-lab/tenant')) {
    return 'tenant';
  }
  if (kind.includes('topology')) {
    return 'topology';
  }
  if (kind.includes('signal')) {
    return 'signal';
  }
  if (kind.includes('policy')) {
    return 'policy';
  }
  return 'runtime';
};

export class ControlPluginRegistry<const TChain extends readonly PluginDefinition[] = readonly PluginDefinition[]> {
  readonly #namespace: PluginNamespace;
  readonly #namespaceVersion: `${number}.${number}.${number}`;
  readonly #plugins: TChain;
  readonly #stages: readonly ControlStage[];

  constructor(input: ControlRegistryOptions, plugins: TChain) {
    this.#namespace = canonicalizeNamespace(input.namespace);
    this.#namespaceVersion = input.namespaceVersion;
    this.#plugins = plugins;
    this.#stages = input.stageOrder?.length ? input.stageOrder : controlStages;
  }

  get namespace(): string {
    return this.#namespace;
  }

  get manifest(): RegistryManifest {
    const pluginKinds = this.#plugins.map((plugin) => plugin.kind);
    return {
      namespace: this.#namespace,
      namespaceVersion: this.#namespaceVersion,
      pluginCount: this.#plugins.length,
      stageCount: this.#stages.length,
      pluginKinds,
    };
  }

  get plugins(): Readonly<TChain> {
    return this.#plugins;
  }

  private stageForKind(kind: PluginKind, fallback: number): ControlStage {
    const normalized = kind.split('/').at(-1) ?? 'runtime';
    return normalized === 'input'
      ? this.#stages[0] ?? 'prepare'
      : normalized === 'simulate'
        ? 'telemetry'
        : normalized === 'recommend'
          ? 'resolve'
          : this.#stages[fallback % this.#stages.length] ?? 'prepare';
  }

  async *run(
    input: readonly unknown[] = [],
    contextFactory: (stage: ControlStage, runId: ControlRunId) => PluginContext<Record<string, unknown>>,
  ): AsyncGenerator<ControlPluginExecution<unknown>, ControlRegistryResult<unknown>, void> {
    const chain = this.#plugins as unknown as CompatibleChain<TChain> & readonly PluginDefinition[];
    const runId = createControlRunId(this.#namespace);
    const events: ControlEvent[] = [];
    const logs: string[] = [];

    for (const [index, plugin] of chain.entries()) {
      const stage = this.stageForKind(plugin.kind, index);
      const event: ControlEvent = {
        name: buildControlEventName(controlScopes[0] as typeof controlScopes[number], controlKinds[0], index),
        bucket: `${plugin.namespace}::${plugin.id}` as ControlTimelineBucket,
        emittedAt: new Date().toISOString(),
        payload: {
          plugin: plugin.name,
          kind: plugin.kind,
          scope: scopeForKind(plugin.kind),
          configured: plugin.tags.length,
          dependencies: plugin.dependencies,
        },
      };
      events.push(event);
      logs.push(`boot:${plugin.name}`);
      yield { stage, event, output: plugin.id };
    }

    const chainResult = await executePluginChain(
      chain,
      contextFactory('execute', runId),
      input[0] as unknown,
    );

    const pluginEvents: readonly PluginEvent[] = collectPluginEvents([]);
    const diagnostics = [
      ...pluginEvents.map((entry) => `${entry.name}:${entry.at}`),
      ...logs,
      ...(chainResult.ok ? [`ok:${chain.length}`] : chainResult.errors ?? []),
    ];

    const output = chainResult.ok ? (chainResult.value as unknown) : undefined;
    const score = chainResult.ok ? 100 - Math.min(90, pluginEvents.length * 10) : 0;

    if (chainResult.ok) {
      yield {
        stage: 'close',
        event: {
          name: buildControlEventName('runtime', 'report', logs.length),
          bucket: `${runId}::runtime` as ControlTimelineBucket,
          emittedAt: new Date().toISOString(),
          payload: {
            diagnostics,
            output,
          },
        },
        output: chainResult.value,
      };
      return {
        output,
        diagnostics,
        score,
        runId,
        generatedAt: new Date().toISOString(),
      };
    }

    return {
      output,
      diagnostics,
      score,
      runId,
      generatedAt: new Date().toISOString(),
    };
  }
}

type ControlPluginMetadata = {
  readonly namespace: PluginNamespace;
  readonly stage: ControlStage;
  readonly kind: string;
  readonly metadata: {
    readonly scope: string;
    readonly kind: string;
  };
};

const createPlugin = <TKind extends PluginKind, TInput, TOutput>(
  namespace: PluginNamespace,
  name: string,
  kind: TKind,
  config: ControlPluginMetadata,
  run: (input: TInput) => Promise<
    { ok: true; value: TOutput; generatedAt: string } | { ok: false; generatedAt: string; errors: readonly string[] }
  >,
): PluginDefinition<unknown, TOutput, Record<string, unknown>, TKind> =>
  buildPluginDefinition(namespace, kind, {
    name,
    version: '1.0.0',
    tags: [config.stage, config.kind],
    dependencies: [],
    pluginConfig: config as Record<string, unknown>,
    run: async (_context, input) => run(input as TInput),
  });

export const buildControlPlugins = (): readonly [
  PluginDefinition<unknown, { readonly status: 'prepared'; readonly queue: readonly string[]; readonly stage: 'prepare' }, Record<string, unknown>, PluginKind>,
  PluginDefinition<unknown, { readonly status: 'executed'; readonly queue: string[]; readonly stage: 'telemetry' }, Record<string, unknown>, PluginKind>,
  PluginDefinition<unknown, { readonly status: string; readonly recommendation: 'complete'; readonly stage: 'resolve' }, Record<string, unknown>, PluginKind>,
] => {
  const namespace = canonicalizeNamespace('recovery-lab-control');
  return [
    createPlugin(
      namespace,
      'prepare',
      'stress-lab/tenant/input' as PluginKind,
      {
        namespace,
        stage: 'prepare',
        kind: 'input',
        metadata: {
          scope: 'tenant',
          kind: 'input',
        },
      },
      async (input: { readonly items: readonly string[] }) => ({
        ok: true,
        value: {
          status: 'prepared',
          queue: [...input.items],
          stage: 'prepare',
        } as const,
        generatedAt: new Date().toISOString(),
      }),
    ),
    createPlugin(
      namespace,
      'execute',
      'stress-lab/topology/simulate' as PluginKind,
      {
        namespace,
        stage: 'telemetry',
        kind: 'simulate',
        metadata: {
          scope: 'topology',
          kind: 'simulate',
        },
      },
      async (input: { readonly queue: readonly string[] }) => ({
        ok: true,
        value: {
          status: 'executed',
          queue: [...input.queue].toReversed(),
          stage: 'telemetry',
        } as const,
        generatedAt: new Date().toISOString(),
      }),
    ),
    createPlugin(
      namespace,
      'close',
      'stress-lab/policy/recommend' as PluginKind,
      {
        namespace,
        stage: 'resolve',
        kind: 'recommend',
        metadata: {
          scope: 'policy',
          kind: 'recommend',
        },
      },
      async (input: { readonly status: string }) => ({
        ok: true,
        value: {
          status: input.status,
          recommendation: 'complete',
          stage: 'resolve',
        } as const,
        generatedAt: new Date().toISOString(),
      }),
    ),
  ];
};

export const createControlRun = (): Promise<ControlRegistryResult<string>> => {
  const registry = new ControlPluginRegistry({
    namespace: 'recovery-lab-control',
    namespaceVersion: '1.0.0',
    stageOrder: controlStages,
  }, buildControlPlugins());

  return (async () => {
    const diagnostics: string[] = [];
    const runId = createControlRunId('recovery-lab-control');
    let output = '';
    const createContext = (): PluginContext<Record<string, unknown>> => ({
      tenantId: 'tenant',
      requestId: `control-run`,
      namespace: canonicalizeNamespace(registry.namespace),
      startedAt: new Date().toISOString(),
      config: {},
    });
    for await (const event of registry.run([{ items: ['alpha', 'beta', 'gamma'] }], createContext)) {
      diagnostics.push(`${event.stage}:${event.event.name}`);
      if (typeof event.output === 'string') {
        output = event.output;
      }
    }
    return {
      output,
      diagnostics,
      score: diagnostics.length > 0 ? diagnostics.length : 0,
      runId,
      generatedAt: new Date().toISOString(),
    };
  })();
};

const controlScopes = ['tenant', 'topology', 'signal', 'policy', 'runtime'] as const;
