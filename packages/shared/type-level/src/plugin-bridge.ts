import { Brand, type NoInfer } from './patterns';

export type BridgeNamespace = Brand<string, 'BridgePluginNamespace'>;
export type BridgePluginKind<TName extends string = string> = `stress-lab/bridge/${TName}`;
export type BridgePluginDependency = `dep:${string}`;
export type BridgePluginId<TName extends string = string> = Brand<`${BridgePluginKind<TName>}::${string}`, 'BridgePluginId'>;
export type BridgePluginVersion = `${number}.${number}.${number}`;

export type BridgePluginTemplate<TSuffix extends string = string> = `bridge:${TSuffix}`;

export interface BridgePluginInput<TPayload = unknown> {
  readonly tenantId: string;
  readonly payload: TPayload;
  readonly mode: 'simulate' | 'observe' | 'verify';
}

export interface BridgePluginOutput<TValue = unknown> {
  readonly tenantId: string;
  readonly pluginId: string;
  readonly value: TValue;
  readonly stage: number;
  readonly status: 'complete' | 'partial';
}

export interface BridgePluginManifest<
  TInput = unknown,
  TOutput = unknown,
  TKind extends BridgePluginKind<string> = BridgePluginKind<string>,
> {
  readonly name: string;
  readonly namespace: BridgeNamespace;
  readonly kind: TKind;
  readonly tags: readonly string[];
  readonly dependencies: readonly BridgePluginDependency[];
  readonly handler: (input: BridgePluginInput<TInput>) => Promise<BridgePluginOutput<TOutput>>;
}

export interface PluginTelemetry {
  readonly pluginId: string;
  readonly tenantId: string;
  readonly at: string;
  readonly stage: number;
  readonly severity: 'trace' | 'info' | 'warn' | 'error';
}

export interface BridgePluginDefinition<
  TInput = unknown,
  TOutput = unknown,
  TConfig extends Record<string, unknown> = Record<string, unknown>,
  TKind extends string = BridgePluginKind,
> {
  readonly id: BridgePluginId<TKind>;
  readonly name: string;
  readonly namespace: BridgeNamespace;
  readonly kind: TKind;
  readonly version: BridgePluginVersion;
  readonly tags: readonly string[];
  readonly dependencies: readonly BridgePluginDependency[];
  readonly config: TConfig;
  readonly run: (
    context: { readonly tenantId: string; readonly config: TConfig; readonly namespace: BridgeNamespace },
    input: TInput,
  ) => Promise<{
    readonly ok: boolean;
    readonly generatedAt: string;
    readonly value?: TOutput;
    readonly errors?: readonly string[];
  }>;
}

type BridgeBuildNamespace = (value: string) => BridgeNamespace;

const buildNamespace = (value: string): BridgeNamespace =>
  value.toLowerCase().replace(/\s+/g, '-') as BridgeNamespace;

const buildBridgeId = <TName extends string>(
  namespace: BridgeNamespace,
  kind: BridgePluginKind<TName>,
  name: string,
): BridgePluginId<BridgePluginKind<TName>> => `${namespace}::${kind}::${name}` as BridgePluginId<BridgePluginKind<TName>>;

const buildVersion = (major: number, minor: number, patch: number): BridgePluginVersion =>
  `${major}.${minor}.${patch}` as BridgePluginVersion;

const buildStage = (value: string): BridgePluginOutput<unknown>['stage'] => {
  const normalized = Number.parseInt(value, 10);
  return Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
};

export const bridgePlugin = <
  const TName extends string,
  TInput,
  TOutput,
  TConfig extends Record<string, unknown> = Record<string, unknown>,
>(
  manifest: BridgePluginManifest<TInput, TOutput, BridgePluginKind<TName>> & { readonly config: TConfig },
): BridgePluginDefinition<TInput, TOutput, TConfig, BridgePluginKind<TName>> => {
  const namespace = manifest.namespace;
  const kind = manifest.kind as BridgePluginKind<TName>;
  const definition: BridgePluginDefinition<TInput, TOutput, TConfig, BridgePluginKind<TName>> = {
    id: buildBridgeId(namespace, kind, manifest.name),
    name: manifest.name,
    namespace,
    kind,
    version: buildVersion(1, 0, 0),
    tags: manifest.tags,
    dependencies: manifest.dependencies,
    config: manifest.config,
    run: async (context, input) => {
      const output = await manifest.handler({
        tenantId: context.tenantId,
        payload: input,
        mode: 'observe',
      });
      return {
        ok: true,
        value: output as TOutput,
        generatedAt: new Date().toISOString(),
        errors: output.status === 'partial' ? ['partial-run'] : undefined,
      };
    },
  };

  return definition;
};

export type BridgePluginMap<TPlugins extends readonly BridgePluginDefinition[]> = {
  [P in TPlugins[number] as P['kind']]: Extract<TPlugins[number], { kind: P['kind'] }>;
};

export type PluginDependencyChain<TPlugins extends readonly BridgePluginDefinition[]> = {
  readonly [K in keyof TPlugins]: {
    readonly dependsOn: TPlugins[K]['dependencies'];
    readonly kind: TPlugins[K]['kind'];
  };
};

export type PluginTelemetryDigest = {
  readonly pluginKinds: readonly string[];
  readonly namespace: BridgeNamespace;
  readonly dependencyCount: number;
  readonly pluginCount: number;
  readonly manifestDigest: string;
};

export const buildBridgeChain = <TPlugins extends readonly BridgePluginDefinition[]>(
  plugins: TPlugins,
): Map<string, readonly BridgePluginDependency[]> => {
  const edges = new Map<string, readonly BridgePluginDependency[]>();
  for (const plugin of plugins) {
    edges.set(plugin.id, [...plugin.dependencies]);
  }
  return edges;
};

export const buildBridgeManifest = <
  const TPlugins extends readonly BridgePluginDefinition[],
  const TName extends string,
>(
  namespace: TName,
  plugins: NoInfer<TPlugins>,
) => {
  const pluginKinds = plugins.map((plugin) => plugin.kind);
  const chain = buildBridgeChain(plugins);
  const manifestDigest = [
    namespace,
    `${plugins.length}`,
    `${chain.size}`,
  ].join('::');

  return {
    namespace: buildNamespace(String(namespace)),
    pluginCount: plugins.length,
    pluginKinds,
    manifestDigest,
    dependencyCount: [...chain.values()].reduce((acc, entries) => acc + entries.length, 0),
  } satisfies PluginTelemetryDigest;
};

export const bridgeNamespace = (value: string): BridgeNamespace => buildNamespace(value);

export const isBridgeInput = <T>(value: unknown): value is BridgePluginInput<T> => {
  return (
    value !== null &&
    typeof value === 'object' &&
    'tenantId' in value &&
    'payload' in value &&
    'mode' in value &&
    typeof (value as BridgePluginInput<T>).tenantId === 'string'
  );
};

export const buildTelemetrySample = (input: {
  readonly tenantId: string;
  readonly pluginId: string;
  readonly stage: number;
}): PluginTelemetry => {
  const stage = buildStage(String(input.stage));
  return {
    pluginId: input.pluginId,
    tenantId: input.tenantId,
    at: new Date().toISOString(),
    stage,
    severity: input.stage > 2 ? 'warn' : 'info',
  };
};

export const buildBridgeRegistryDigest = <TPlugins extends readonly BridgePluginDefinition[]>(
  namespace: BridgeNamespace,
  plugins: NoInfer<TPlugins>,
): string => {
  const manifest = buildBridgeManifest(namespace, plugins);
  return `${manifest.namespace}#${manifest.manifestDigest}#${manifest.pluginKinds.length}#${manifest.pluginCount}`;
};
