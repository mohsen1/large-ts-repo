import {
  buildConvergencePluginId,
  buildConvergencePluginVersion,
  buildConvergenceRunId,
  buildConvergenceNamespace,
  toPluginKind,
  defaultConvergenceStages,
  type ConvergenceInput,
  type ConvergenceOutput,
  type ConvergencePlugin,
  type ConvergenceRunId,
  type ConvergenceScope,
  type ConvergenceStage,
  toConvergenceOutput,
} from './types';
import {
  canonicalizeNamespace,
  PluginRegistry,
  type PluginContext,
  type PluginDefinition,
  type PluginKind,
} from '@shared/stress-lab-runtime';
import { createTenantId } from '@domain/recovery-stress-lab';

export interface RegisteredPlugin {
  readonly pluginId: ConvergencePlugin['id'];
  readonly namespace: string;
  readonly scope: ConvergenceScope;
  readonly stage: ConvergenceStage;
  readonly registeredAt: string;
}

export interface CatalogManifest {
  readonly namespace: string;
  readonly pluginCount: number;
  readonly byStage: Record<ConvergenceStage, number>;
  readonly byScope: Record<ConvergenceScope, number>;
}

export interface PluginBundleOptions {
  readonly runId: ConvergenceRunId;
  readonly namespace?: string;
  readonly stageOrder?: readonly ConvergenceStage[];
}

const scopeFromKind = (kind: string): ConvergenceScope => {
  if (kind.includes('/tenant/')) return 'tenant';
  if (kind.includes('/topology/')) return 'topology';
  if (kind.includes('/signal/')) return 'signal';
  if (kind.includes('/policy/')) return 'policy';
  return 'fleet';
};

const stageFromKind = (kind: string): ConvergenceStage => {
  if (kind.endsWith('/input')) return 'input';
  if (kind.endsWith('/resolve')) return 'resolve';
  if (kind.endsWith('/simulate')) return 'simulate';
  if (kind.endsWith('/recommend')) return 'recommend';
  return 'report';
};

type RegistryPlugin = PluginDefinition<any, any, Record<string, unknown>, PluginKind>;

export interface ConvergencePluginBuilderOptions<
  TScope extends ConvergenceScope,
  TStage extends ConvergenceStage,
  TInput extends ConvergenceInput<TStage>,
> {
  readonly scope: TScope;
  readonly stage: TStage;
  readonly name: string;
  readonly namespace?: string;
  readonly tags: readonly string[];
  readonly dependencies: readonly string[];
  readonly pluginConfig: {
    readonly namespace: string;
    readonly scope: TScope;
    readonly stage: TStage;
    readonly config: Record<string, unknown>;
  };
  readonly run: (
    context: PluginContext<Record<string, unknown>>,
    input: TInput,
  ) => Promise<{ ok: true; value: ConvergenceOutput<TStage>; generatedAt: string }>;
}

export const buildConvergencePlugin = <
  const TScope extends ConvergenceScope,
  const TStage extends ConvergenceStage,
  TInput extends ConvergenceInput<TStage>,
>(
  options: ConvergencePluginBuilderOptions<TScope, TStage, TInput>,
): ConvergencePlugin<TInput, ConvergenceOutput<TStage>> => {
  const namespace = canonicalizeNamespace(options.namespace ?? buildConvergenceNamespace());
  const kind = toPluginKind(options.scope, options.stage);
  const seedRunId = buildConvergenceRunId(createTenantId(`${namespace}:seed`), `${options.name}:${options.stage}`);

  return {
    id: buildConvergencePluginId(namespace, options.scope, options.stage, options.name),
    name: options.name,
    namespace,
    kind: kind as PluginKind,
    version: buildConvergencePluginVersion(),
    tags: [...options.tags],
    dependencies: options.dependencies as readonly [`dep:${string}` & string],
    config: {
      ...options.pluginConfig,
      pluginRunId: seedRunId,
    },
    run: options.run,
  } as ConvergencePlugin<TInput, ConvergenceOutput<TStage>>;
};

export class ConvergencePluginCatalog {
  #namespace: string;
  #stageOrder: readonly ConvergenceStage[];
  #registry: PluginRegistry;
  #events: RegisteredPlugin[] = [];

  constructor(
    runId: ConvergenceRunId,
    namespace = 'recovery-lab-orchestration-core',
    stageOrder: readonly ConvergenceStage[] = defaultConvergenceStages,
  ) {
    void runId;
    this.#namespace = namespace;
    this.#stageOrder = stageOrder;
    this.#registry = PluginRegistry.create(canonicalizeNamespace(namespace));
  }

  get namespace(): string {
    return this.#namespace;
  }

  register(plugin: RegistryPlugin): this {
    this.#registry.register(plugin);
    const kind = plugin.kind;
    this.#events.push({
      pluginId: plugin.id,
      namespace: this.#namespace,
      scope: scopeFromKind(kind),
      stage: stageFromKind(kind),
      registeredAt: new Date().toISOString(),
    });
    return this;
  }

  registerMany(plugins: readonly RegistryPlugin[]): this {
    for (const plugin of plugins) {
      this.register(plugin);
    }
    return this;
  }

  list(): readonly RegistryPlugin[] {
    return this.#registry.list() as readonly RegistryPlugin[];
  }

  byScope(scope: ConvergenceScope): readonly RegistryPlugin[] {
    return this.#events
      .filter((entry) => entry.scope === scope)
      .map((entry) => this.#registry.get(String(entry.pluginId)))
      .filter((entry): entry is RegistryPlugin => entry !== undefined);
  }

  byStage(stage: ConvergenceStage): readonly RegistryPlugin[] {
    return this.#events
      .filter((entry) => entry.stage === stage)
      .map((entry) => this.#registry.get(String(entry.pluginId)))
      .filter((entry): entry is RegistryPlugin => entry !== undefined);
  }

  buildChain(input: ConvergenceInput, stages: readonly ConvergenceStage[] = this.#stageOrder): readonly RegistryPlugin[] {
    const index = this.#stageOrder.indexOf(input.stage);
    const active = new Set(stages);

    return this.list()
      .filter((plugin) => {
        const pluginStage = stageFromKind(plugin.kind);
        const stageOffset = this.#stageOrder.indexOf(pluginStage);
        return active.has(pluginStage) && stageOffset >= index;
      })
      .toSorted((left, right) => this.#stageOrder.indexOf(stageFromKind(left.kind)) - this.#stageOrder.indexOf(stageFromKind(right.kind)));
  }

  manifest(): CatalogManifest {
    const byScope = {
      tenant: 0,
      topology: 0,
      signal: 0,
      policy: 0,
      fleet: 0,
    } as Record<ConvergenceScope, number>;

    const byStage = {
      input: 0,
      resolve: 0,
      simulate: 0,
      recommend: 0,
      report: 0,
    } as Record<ConvergenceStage, number>;

    for (const entry of this.#events) {
      byScope[entry.scope] += 1;
      byStage[entry.stage] += 1;
    }

    return {
      namespace: this.#namespace,
      pluginCount: this.#events.length,
      byScope,
      byStage,
    };
  }

  resolve(input: ConvergenceInput, output: ConvergenceOutput, preferredScope: ConvergenceScope): ConvergenceOutput {
    const scopePlugins = this.byScope(preferredScope);
    const baseline = output.diagnostics.length === 0 ? ['seed'] : [];

    return {
      ...output,
      diagnostics: [...output.diagnostics, ...scopePlugins.map((plugin) => plugin.name), ...baseline],
      score: Math.min(1, output.score + Math.min(0.05, scopePlugins.length * 0.01)),
      confidence: Math.min(1, output.confidence + Math.min(0.2, scopePlugins.length * 0.04)),
    };
  }
}

export const createCatalog = (options: PluginBundleOptions): ConvergencePluginCatalog => {
  return new ConvergencePluginCatalog(options.runId, options.namespace, options.stageOrder);
};

export const registerConvergenceDefaults = (catalog: ConvergencePluginCatalog, contextName: string): void => {
  const namespace = canonicalizeNamespace(contextName);
  const tenantId = createTenantId('tenant:recovery-lab-orchestration');

  const pluginRunId = buildConvergenceRunId(tenantId, 'default');
  const seedPlugin = {
    id: buildConvergencePluginId(namespace, 'tenant', 'input', 'convergence-seed'),
    name: 'convergence-seed',
    namespace,
    kind: 'stress-lab/tenant/input' as const,
    version: buildConvergencePluginVersion(),
    tags: ['seed', 'runtime'],
    dependencies: ['dep:recovery:stress:lab'],
    config: {
      namespace,
      scope: 'tenant',
      stage: 'input',
      pluginRunId,
    },
    run: async (_context: PluginContext<Record<string, unknown>>, input: ConvergenceInput<'input'>): Promise<{
      ok: true;
      value: ReturnType<typeof toConvergenceOutput<'input'>>;
      generatedAt: string;
    }> => ({
      ok: true,
      value: toConvergenceOutput<'input'>(
        input,
        'input',
        0.5,
        ['seed:seeded'],
      ),
      generatedAt: new Date().toISOString(),
    }),
  } satisfies ConvergencePlugin<ConvergenceInput<'input'>, ConvergenceOutput<'input'>> as ConvergencePlugin<ConvergenceInput<'input'>, ConvergenceOutput<'input'>>;

  catalog.register(seedPlugin);
};
