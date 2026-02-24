import {
  buildPluginDefinition,
  runPluginSafe,
  type PluginContext,
  type PluginDefinition,
  type PluginResult,
  type PluginResultOk,
  type PluginKind,
} from './plugin-registry';
import {
  buildPluginVersion,
  canonicalizeNamespace,
  type PluginDependency,
  type PluginId,
  type PluginNamespace,
} from './ids';
import { collectIterable, mapIterable, zipLongest } from './iterator-utils';
import { PluginSession, pluginSessionConfigFrom } from './lifecycle';

type NoInfer<T> = [T][T extends any ? 0 : never];

type AssertNever<T> = T extends never ? true : false;

export type RecursiveTupleTail<T extends readonly unknown[]> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Tail extends readonly unknown[]
    ? readonly [...NoInfer<Head[]>, ...RecursiveTupleTail<Tail>]
    : readonly []
  : readonly [];

export type PluginNamespaceRoute<T extends string> = T extends `${infer Head}/${infer Tail}`
  ? readonly [Head, ...PluginNamespaceRoute<Tail>]
  : readonly [T];

export type PrefixedRecord<TSource extends Record<string, unknown>, TPrefix extends string> = {
  [K in keyof TSource as K extends string ? `${TPrefix}${K}` : never]: TSource[K];
};

export type PluginEventNameFor<T extends PluginKind, TState extends string> = `${T}:${TState}:${string}`;

export interface WorkbenchChainInput {
  readonly tenantId: string;
  readonly scenario?: string;
  readonly topology?: unknown;
  readonly selectedRunbooks?: readonly string[];
  readonly selectedSignals?: readonly string[];
  readonly selectedSignalIds?: readonly string[];
  readonly recommendations?: readonly string[];
  readonly traceCount?: number;
  readonly route?: readonly string[];
}

export interface WorkbenchChainOutput {
  readonly tenantId: string;
  readonly stage: PluginKind;
  readonly generatedAtTag: string;
  readonly route: readonly string[];
  readonly topology?: unknown;
  readonly selectedRunbooks?: readonly string[];
  readonly recommendations?: readonly string[];
  readonly signals?: readonly string[];
}

export interface PluginCatalogSeed<
  TKind extends PluginKind = PluginKind,
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: string;
  readonly kind: TKind;
  readonly tags: readonly string[];
  readonly dependencies: readonly PluginDependency[];
  readonly namespace: string;
  readonly version: readonly [major: number, minor: number, patch: number];
  readonly config: TConfig;
  readonly runner: (
    context: PluginContext<Record<string, unknown>>,
    input: WorkbenchChainInput,
  ) => Promise<PluginResultOk<WorkbenchChainOutput>>;
}

export interface CatalogSummary {
  readonly namespace: PluginNamespace;
  readonly count: number;
  readonly namespaceTags: readonly string[];
  readonly pluginTags: readonly string[];
}

type CatalogSeedError = {
  readonly seedName: string;
  readonly reason: string;
};

export interface CatalogBuildResult {
  readonly ok: boolean;
  readonly definitions: readonly PluginDefinition[];
  readonly errors: readonly CatalogSeedError[];
}

export interface CatalogSnapshot {
  readonly namespace: PluginNamespace;
  readonly namespacePath: readonly string[];
  readonly catalog: readonly PluginDefinition[];
  readonly tags: readonly string[];
  readonly count: number;
}

export interface CatalogAudit {
  readonly pluginId: PluginId;
  readonly stage: PluginKind;
  readonly ok: boolean;
}

export type PluginDefinitionRecord<TCatalog extends readonly PluginDefinition[]> = {
  [K in TCatalog[number]['id']]: Extract<TCatalog[number], { readonly id: K }>;
};

const ROOT_NAMESPACE = canonicalizeNamespace('recovery:stress:lab:catalog');
const PLUGIN_ROUTE = ['planner', 'shape', 'simulate', 'recommend', 'report'] as const;

const toPluginRoute = <TPath extends readonly string[]>(path: TPath): string =>
  path.join('->');

const formatCatalogSeedTag = <T extends string>(seedKind: T): `seed:${T}` => `seed:${seedKind}`;

type SeedBase = Omit<PluginCatalogSeed, 'runner'>;

const withPluginState = (
  seed: { readonly kind: PluginKind; readonly name: string },
  input: WorkbenchChainInput,
): WorkbenchChainOutput => {
  const baseRoute = input.route ?? [];
  return {
    tenantId: input.tenantId,
    stage: seed.kind,
    generatedAtTag: `${seed.kind}:${seed.name}:${input.tenantId}:${baseRoute.length}`,
    route: [seed.name, ...baseRoute],
    topology: input.topology,
    selectedRunbooks: input.selectedRunbooks,
    recommendations: input.recommendations,
    signals: input.selectedSignals,
  };
};

const buildSeed = <
  const TKind extends PluginKind,
  TConfig extends Record<string, unknown>,
>(seed: SeedBase & { readonly kind: TKind; readonly config: TConfig }): PluginCatalogSeed<TKind, TConfig> => ({
  ...seed,
  runner: async (_context, input) => ({
    ok: true,
    value: withPluginState({ kind: seed.kind, name: seed.name }, {
      ...input,
      route: [seed.name, toPluginRoute([formatCatalogSeedTag(seed.kind)] as readonly string[])],
    }),
    generatedAt: new Date().toISOString(),
  }),
});

const baseRoute = (index: number): string => PLUGIN_ROUTE[index % PLUGIN_ROUTE.length];

const defaultCatalogSeeds = [
  buildSeed({
    name: 'planner',
    kind: 'stress-lab/plan',
    tags: ['core', 'plan'],
    dependencies: [],
    namespace: 'recovery/stress-lab/catalog/planner',
    version: [1, 0, 0],
    config: {
      strategy: 'heuristic' as const,
      timeoutMs: 750,
      route: baseRoute(0),
    },
  }),
  buildSeed({
    name: 'shape',
    kind: 'stress-lab/shape',
    tags: ['core', 'shape'],
    dependencies: ['dep:recovery:stress:lab:planner'],
    namespace: 'recovery/stress-lab/catalog/shape',
    version: [1, 0, 0],
    config: {
      strategy: 'topology' as const,
      maxDepth: 16,
      route: baseRoute(1),
    },
  }),
  buildSeed({
    name: 'simulate',
    kind: 'stress-lab/simulate',
    tags: ['simulation'],
    dependencies: ['dep:recovery:stress:lab:shape'],
    namespace: 'recovery/stress-lab/catalog/simulate',
    version: [1, 0, 0],
    config: {
      sampleCount: 8,
      tolerance: 0.12,
      route: baseRoute(2),
    },
  }),
  buildSeed({
    name: 'recommend',
    kind: 'stress-lab/recommend',
    tags: ['recommendation'],
    dependencies: ['dep:recovery:stress:lab:simulate'],
    namespace: 'recovery/stress-lab/catalog/recommend',
    version: [1, 0, 1],
    config: {
      policy: 'balanced' as const,
      enableAutoFix: true,
      route: baseRoute(3),
    },
  }),
  buildSeed({
    name: 'report',
    kind: 'stress-lab/report',
    tags: ['report'],
    dependencies: ['dep:recovery:stress:lab:recommend'],
    namespace: 'recovery/stress-lab/catalog/report',
    version: [1, 0, 3],
    config: {
      format: 'json' as const,
      includeTrace: true,
      route: baseRoute(4),
    },
  }),
] as const satisfies readonly PluginCatalogSeed[];

const buildSeedDefinition = (
  seed: PluginCatalogSeed,
): PluginDefinition<WorkbenchChainInput, WorkbenchChainOutput> => {
  const namespace = canonicalizeNamespace(seed.namespace);
  return buildPluginDefinition(namespace, seed.kind, {
    name: seed.name,
    version: buildPluginVersion(seed.version[0], seed.version[1], seed.version[2]),
    tags: seed.tags,
    dependencies: seed.dependencies,
    pluginConfig: seed.config,
    run: seed.runner,
  }) as PluginDefinition<WorkbenchChainInput, WorkbenchChainOutput>;
};

const buildDefaultCatalog = (): CatalogBuildResult => {
  const definitions: PluginDefinition[] = [];
  const errors: CatalogSeedError[] = [];

  for (const seed of defaultCatalogSeeds) {
    try {
      definitions.push(buildSeedDefinition(seed) as PluginDefinition);
    } catch (error) {
      errors.push({
        seedName: seed.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: errors.length === 0,
    definitions,
    errors,
  };
};

export const defaultCatalogResult = buildDefaultCatalog();
export const defaultCatalog: readonly PluginDefinition[] = defaultCatalogResult.ok ? defaultCatalogResult.definitions : [];

export const buildCatalogFingerprint = <TDefinitions extends readonly PluginDefinition[]>(
  definitions: TDefinitions,
): string => {
  const zipped = zipLongest(
    definitions,
    [...Array(definitions.length).keys()] as const,
  );
  const values = collectIterable(
    mapIterable(zipped, ([entry, index]) => `${entry?.id ?? 'missing'}:${index ?? -1}`),
  );
  return values.join('||');
};

const toNamespacePath = (namespace: PluginNamespace): readonly string[] => {
  return namespace.split(':').filter((entry) => entry.length > 0);
};

const mapByKind = <TKind extends PluginKind>(values: readonly PluginDefinition[], kind: TKind): readonly PluginDefinition<
  unknown,
  unknown,
  Record<string, unknown>,
  TKind
>[] => values.filter(
  (entry): entry is PluginDefinition<unknown, unknown, Record<string, unknown>, TKind> => entry.kind === kind,
);

export const resolveCatalogDependencyGraph = <TDefinitions extends readonly PluginDefinition[]>(definitions: TDefinitions) => {
  const ordered = [...definitions].sort((left, right) => left.name.localeCompare(right.name)) as unknown as TDefinitions;
  const namespace = ordered.length === 0 ? ROOT_NAMESPACE : canonicalizeNamespace(ordered[0]?.namespace ?? ROOT_NAMESPACE);
  const tags = Array.from(new Set(ordered.flatMap((entry) => entry.tags)));
  const paths = ordered.map((entry) => toNamespacePath(canonicalizeNamespace(entry.namespace)));

  return {
    namespace,
    ordered,
    tags,
    paths,
    byKind: {
      plan: mapByKind(ordered, 'stress-lab/plan'),
      shape: mapByKind(ordered, 'stress-lab/shape'),
      simulate: mapByKind(ordered, 'stress-lab/simulate'),
      recommend: mapByKind(ordered, 'stress-lab/recommend'),
      report: mapByKind(ordered, 'stress-lab/report'),
    },
} as {
    namespace: PluginNamespace;
    ordered: TDefinitions;
    tags: readonly string[];
    paths: readonly (readonly string[])[];
    byKind: {
      plan: readonly PluginDefinition<unknown, unknown, Record<string, unknown>, 'stress-lab/plan'>[];
      shape: readonly PluginDefinition<unknown, unknown, Record<string, unknown>, 'stress-lab/shape'>[];
      simulate: readonly PluginDefinition<unknown, unknown, Record<string, unknown>, 'stress-lab/simulate'>[];
      recommend: readonly PluginDefinition<unknown, unknown, Record<string, unknown>, 'stress-lab/recommend'>[];
      report: readonly PluginDefinition<unknown, unknown, Record<string, unknown>, 'stress-lab/report'>[];
    };
  };
};

export type CatalogRoutePath = ReturnType<typeof resolveCatalogDependencyGraph>;

export const validateCatalogRoutePath = <T extends CatalogRoutePath>(snapshot: T): T => snapshot;

export class PluginCatalogSnapshot {
  readonly namespace: PluginNamespace;
  readonly namespacePath: readonly string[];
  readonly catalog: readonly PluginDefinition[];
  readonly #session: PluginSession;

  constructor(catalog: readonly PluginDefinition[], namespace: PluginNamespace = ROOT_NAMESPACE) {
    this.catalog = catalog;
    this.namespace = namespace;
    this.namespacePath = namespace.split(':');
    this.#session = new PluginSession(
      pluginSessionConfigFrom('stress-lab-catalog', namespace, `snapshot:${Date.now()}`),
    );
  }

  [Symbol.dispose](): void {
    this.#session[Symbol.dispose]();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#session[Symbol.asyncDispose]();
  }

  toSummary(): CatalogSummary {
    const namespaceTags = this.namespacePath.map((segment) => `namespace:${segment}`);
    const pluginTags = collectIterable(mapIterable(this.catalog, (entry) => entry.tags)).flat();
    return {
      namespace: this.namespace,
      count: this.catalog.length,
      namespaceTags,
      pluginTags,
    };
  }

  byKind<TKind extends PluginKind>(): readonly PluginDefinition<
    unknown,
    unknown,
    Record<string, unknown>,
    TKind
  >[] {
    return this.catalog.filter(
      (entry): entry is PluginDefinition<unknown, unknown, Record<string, unknown>, TKind> =>
        entry.kind.startsWith('stress-lab/' as PluginKind),
    );
  }

  asRecord(): PluginDefinitionRecord<typeof defaultCatalog> {
    const output: Record<string, PluginDefinition> = {};
    for (const definition of this.catalog) {
      output[String(definition.id)] = definition;
    }
    return output as PluginDefinitionRecord<typeof defaultCatalog>;
  }

  async audit(input: Iterable<{ readonly pluginId: PluginId }>): Promise<readonly CatalogAudit[]> {
    const catalogIndex = new Map<string, PluginDefinition>(
      collectIterable(this.catalog).map((entry) => [entry.id, entry]),
    );
    const output: CatalogAudit[] = [];
    for (const target of input) {
      const found = catalogIndex.get(target.pluginId);
      output.push({
        pluginId: target.pluginId,
        stage: (found?.kind ?? 'stress-lab/plan') as PluginKind,
        ok: found != null,
      });
    }
    return output;
  }
}

export const runCatalogSeedSafe = <TSeed extends PluginCatalogSeed>(
  seed: TSeed,
): Promise<PluginResult<WorkbenchChainOutput>> => {
  const context: PluginContext<Record<string, unknown>> = {
    tenantId: 'catalog-runner',
    requestId: `seed:${seed.name}:${Date.now()}`,
    namespace: canonicalizeNamespace(seed.namespace),
    startedAt: new Date().toISOString(),
    config: seed.config,
  };

  const definition = buildPluginDefinition(seed.config ? canonicalizeNamespace(seed.namespace) : ROOT_NAMESPACE, seed.kind, {
    name: seed.name,
    version: buildPluginVersion(seed.version[0], seed.version[1], seed.version[2]),
    tags: seed.tags,
    dependencies: seed.dependencies,
    pluginConfig: seed.config,
    run: seed.runner,
  });

  return runPluginSafe(definition, context, {
    tenantId: 'catalog-runner',
    selectedSignals: seed.kind.length > 0 ? ['seed'] : undefined,
  } as WorkbenchChainInput);
};

export const mapCatalogEntries = <TDefinitions extends readonly PluginDefinition[], T>(
  entries: TDefinitions,
  mapper: (
    entry: TDefinitions[number],
    index: number,
    isTerminal: boolean,
  ) => T,
): readonly T[] => collectIterable(
  mapIterable(entries, (entry, index) => {
    const isTerminal = index === entries.length - 1;
    return mapper(entry, index, isTerminal);
  }),
);

export const buildSnapshot = async (definitions: Iterable<PluginDefinition>): Promise<CatalogSnapshot> => {
  using _scope = new PluginSession(
    pluginSessionConfigFrom('stress-lab-catalog', ROOT_NAMESPACE, `snapshot:${Date.now()}`),
  );
  const snapshot = new PluginCatalogSnapshot([...definitions], ROOT_NAMESPACE);
  const graph = resolveCatalogDependencyGraph(snapshot.catalog);
  const summary = snapshot.toSummary();
  const tags = graph.tags.filter((entry) => entry.length > 0);
  const route = mapCatalogEntries(graph.ordered, (_, index) => `stage:${index}`).join('|');
  return {
    namespace: snapshot.namespace,
    namespacePath: snapshot.namespacePath,
    catalog: snapshot.catalog,
    tags,
    count: summary.count + route.length,
  };
};

export const summarizeCatalog = (snapshot: PluginCatalogSnapshot): string => {
  const values = snapshot.catalog.map((entry) => `${entry.id}:${entry.kind}`);
  const summary = snapshot.toSummary();
  const byKind = snapshot.byKind<'stress-lab/report'>();
  const byKindCount = byKind.length;
  return `${summary.namespace}|${summary.count}|${byKindCount}|${values.join('|')}`;
};

export const auditSnapshot = async (snapshot: PluginCatalogSnapshot): Promise<string> => {
  const audits = await snapshot.audit(snapshot.catalog.map((entry) => ({ pluginId: entry.id })));
  return audits.filter((entry) => entry.ok).map((entry) => `${entry.pluginId}:${entry.stage}`).join('|');
};
