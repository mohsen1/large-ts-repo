import type { PluginDefinition, PluginName, PluginTag } from '@shared/typed-orchestration-core/registry';

export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info';
export type EventSource = 'signal' | 'policy' | 'orchestrator' | 'diagnostic';
export type RuntimeChannel<TContext extends string = string> = `channel:${TContext}`;
export type RuntimeKind<TKind extends string = string> = `kind:${TKind}`;

export interface RuntimeEvent<TPayload, TContext extends string = string, TKind extends string = string> {
  readonly id: string;
  readonly channel: RuntimeChannel<TContext>;
  readonly kind: RuntimeKind<TKind>;
  readonly event: `${TContext}/${TKind}`;
  readonly severity: Severity;
  readonly timestamp: string;
  readonly source: EventSource;
  readonly payload: TPayload;
}

export interface RuntimeAdapter<TConfig extends string = string> {
  readonly name: `adapter:${TConfig}`;
  readonly connected: boolean;
  readonly version: `v${number}.${number}`;
}

export type AdapterCatalog = readonly RuntimeAdapter[];
export type PluginSeed = Omit<PluginDefinition<unknown, unknown, PluginName>, 'run'>;

const defaultAdapterManifest = [
  {
    name: 'adapter:kafka',
    connected: true,
    version: 'v1.2',
  },
  {
    name: 'adapter:eventbridge',
    connected: false,
    version: 'v2.3',
  },
  {
    name: 'adapter:websocket',
    connected: true,
    version: 'v1.0',
  },
] as const satisfies AdapterCatalog;

const defaultPluginManifest = [
  {
    name: 'plugin:normalizer',
    namespace: 'namespace:quantum',
    version: 'v1.0',
    dependsOn: [],
    tags: ['tag:normalize'],
    description: 'Normalize signals and enforce canonical units.',
  },
  {
    name: 'plugin:aggregator',
    namespace: 'namespace:quantum',
    version: 'v1.0',
    dependsOn: ['plugin:normalizer'],
    tags: ['tag:aggregate'],
    description: 'Aggregate score by risk class and policy surface.',
  },
] as const satisfies readonly Omit<PluginSeed, 'run'>[];

const asPluginManifest = <
  const T extends readonly Omit<PluginDefinition<unknown, unknown, PluginName>, 'run'>[],
>(entries: T): T => entries;

export type RuntimeManifest = {
  readonly adapters: AdapterCatalog;
  readonly plugins: readonly Omit<PluginDefinition<unknown, unknown, PluginName>, 'run'>[];
};

export const defaultRuntimeManifest = {
  adapters: defaultAdapterManifest,
  plugins: asPluginManifest(defaultPluginManifest),
} as const satisfies RuntimeManifest;

export const runtimeManifest: RuntimeManifest = await Promise.resolve(defaultRuntimeManifest);

export const runtimeManifestAdapterNames = (): readonly string[] => runtimeManifest.adapters.map((entry) => entry.name);

export const runtimeManifestPluginCount = (manifest: RuntimeManifest = runtimeManifest): number => manifest.plugins.length;

export const runtimeManifestByTag = <TTag extends PluginTag<string>>(manifest: RuntimeManifest = runtimeManifest, tag: TTag) =>
  manifest.plugins.filter((entry) => entry.tags.includes(tag));
