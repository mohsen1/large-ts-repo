import type { Brand, RecursivePath, TupleOf } from '@shared/core';
import type { NoInfer } from '@shared/type-level';

export type RuntimeScope = `scope:${string}`;
export type StageAlias = Brand<string, 'CascadeStageAlias'>;
export type PluginMode = 'read' | 'write' | 'observe' | 'actuate';
export type RegistryMode = 'static' | 'adaptive' | 'adaptive-ephemeral' | 'diagnostic';

export type StagePath<TStage extends string = string> = `${TStage}::${number}`;
export type StageSlice = readonly `${string}#${string}`[];
export type PluginTag = `tag:${string}`;
export type PluginSchema = readonly string[];
export type PluginCatalog = readonly string[];

export type PluginSignalKind =
  | 'registry.register'
  | 'registry.activate'
  | 'registry.deactivate'
  | 'registry.remove';

export interface RuntimePluginSignal {
  readonly kind: PluginSignalKind;
  readonly tag: PluginTag;
  readonly at: string;
}

export type PluginId = Brand<string, 'PluginId'>;

export interface RuntimePluginManifest {
  readonly pluginId: PluginId;
  readonly scope: RuntimeScope;
  readonly catalog: PluginCatalog;
  readonly namespace: `namespace:${string}`;
  readonly source: `source:${string}`;
  readonly schemaVersion: `v${number}.${number}.${number}`;
  readonly tags: readonly PluginTag[];
}

export interface RuntimePluginDefinition<
  TName extends string = string,
  TMode extends PluginMode = PluginMode,
> {
  readonly pluginId: PluginId;
  readonly name: string;
  readonly mode: TMode;
  readonly description: string;
  readonly schema: PluginSchema;
  readonly tags: readonly PluginTag[];
}

export interface RuntimePlugin<
  TName extends string = string,
  TMode extends PluginMode = PluginMode,
  TSchema extends PluginSchema = PluginSchema,
  TManifest extends RuntimePluginManifest = RuntimePluginManifest,
> {
  readonly plugin: RuntimePluginDefinition<TName, TMode>;
  readonly manifest: TManifest;
  readonly createdAt: string;
  readonly active: boolean;
}

export interface RuntimePluginEnvelope<
  TPlugin extends RuntimePlugin = RuntimePlugin,
  TAlias extends StageAlias = StageAlias,
> {
  readonly scope: RuntimeScope;
  readonly plugin: TPlugin;
  readonly aliases: readonly TAlias[];
  readonly mode: TPlugin['plugin']['mode'];
}

export type RegistryKey<TPrefix extends string = 'registry'> = `${TPrefix}:${string}`;

export interface RuntimeManifest<
  TScope extends string = string,
  TName extends string = string,
  TAlias extends readonly StageAlias[] = readonly StageAlias[],
> {
  readonly scope: RuntimeScope;
  readonly name: `catalog:${TScope}:${TName}`;
  readonly aliases: TAlias;
  readonly namespace: `namespace:${TScope}`;
  readonly source: `source:${TName}`;
  readonly schemaVersion: `v${number}.${number}.${number}`;
  readonly tags: readonly PluginTag[];
  readonly mode: RegistryMode;
}

export type StageTopologySignature<TTuple extends readonly StageAlias[] = readonly StageAlias[]> = {
  readonly alias: string;
  readonly depth: TTuple['length'];
};

export type PluginManifestMap<TPlugin extends RuntimePlugin = RuntimePlugin> = {
  [K in TPlugin['plugin']['name']]: TPlugin;
};

type JoinTuple<TTuple extends readonly string[]> = TTuple extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? `${Head}${Tail['length'] extends 0 ? '' : `.${JoinTuple<Tail>}`}`
  : '';

export const joinAliases = <TValue extends readonly string[]>(values: TValue): JoinTuple<TValue> =>
  values.join('.') as JoinTuple<TValue>;

const scopePrefix = (value: string): value is RuntimeScope =>
  typeof value === 'string' && value.startsWith('scope:');

const toAlias = (value: string): StageAlias => (`alias:${value.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}` as StageAlias);

export const normalizePluginName = <TName extends string>(name: TName): `${string}.${TName}` =>
  name.startsWith('plugin.') ? (name as `${string}.${TName}`) : (`plugin.${name}` as `${string}.${TName}`);

export const normalizeManifestScope = (scope: string): RuntimeScope =>
  scopePrefix(scope) ? scope : (`scope:${scope}` as RuntimeScope);

export const normalizeManifestTag = (tag: string): PluginTag =>
  tag.startsWith('tag:') ? (tag as PluginTag) : (`tag:${tag}` as PluginTag);

export const normalizeMode = (mode: string): RegistryMode =>
  mode === 'adaptive' || mode === 'adaptive-ephemeral' || mode === 'diagnostic' ? mode : 'static';

export const buildRuntimeManifest = <
  const TName extends string,
  const TScope extends string,
  const TAliases extends readonly string[],
>(
  input: {
    readonly name: TName;
    readonly scope: TScope;
    readonly aliases: TAliases;
    readonly tags?: readonly string[];
    readonly source: `source:${TName}`;
    readonly mode?: string;
  },
): RuntimeManifest<TScope, TName> => ({
  scope: normalizeManifestScope(input.scope),
  name: `catalog:${input.scope}:${input.name}` as RuntimeManifest<TScope, TName>['name'],
  aliases: input.aliases.length === 0
    ? ['alias:root'] as readonly [StageAlias]
    : (input.aliases.map((alias) => toAlias(alias)) as readonly [...TAliases & string[]]),
  namespace: `namespace:${input.scope}` as RuntimeManifest<TScope, TName>['namespace'],
  source: input.source,
  schemaVersion: 'v1.0.0',
  tags: ['tag:runtime', ...(input.tags ?? [])].map((tag) => normalizeManifestTag(tag)),
  mode: normalizeMode(input.mode ?? 'static'),
});

export const parseRuntimeManifest = (value: string): RuntimeManifest => {
  const [scope = 'runtime', name = 'default', revision = '1.0.0'] = value.split(':');
  return {
    scope: normalizeManifestScope(scope),
    name: `catalog:${scope}:${name}` as RuntimeManifest['name'],
    aliases: ['alias:bootstrap'] as unknown as readonly StageAlias[],
    namespace: `namespace:${scope}` as RuntimeManifest['namespace'],
    source: `source:${name}` as RuntimeManifest['source'],
    schemaVersion: revision === undefined ? 'v1.0.0' : (`v${revision}` as RuntimeManifest['schemaVersion']),
    tags: ['tag:runtime'],
    mode: 'static',
  };
};

export const buildCatalogFingerprint = <TManifest extends RuntimeManifest>(manifest: TManifest): `${TManifest['name']}:${TManifest['scope']}` =>
  `${manifest.name}:${manifest.scope}` as `${TManifest['name']}:${TManifest['scope']}`;

export const buildManifestFingerprint = <TManifest extends RuntimeManifest>(manifest: TManifest): string =>
  `${manifest.name}::${manifest.namespace}::${manifest.tags.length}`;

export const buildRuntimeTopologyAlias = (prefix: string): string =>
  `topology:${prefix}` as const;

export const buildTopologySignature = <
  const TStageCount extends number,
  const TAlias extends StageAlias[],
>(input: {
  readonly blueprint: string;
  readonly stageCount: TStageCount;
  readonly aliases: TAlias;
}): StageTopologySignature<TAlias> => ({
  alias: joinAliases(input.aliases),
  depth: input.aliases.length,
});

export const inferStageAlias = <TAlias extends readonly StageAlias[]>(aliases: NoInfer<TAlias>): TAlias[number] =>
  aliases[0] ?? ('alias:root' as TAlias[number]);

export const createPathVector = <
  const T extends readonly StageAlias[],
  const TPrefix extends string,
>(
  path: NoInfer<T>,
  prefix: TPrefix,
): TupleOf<`${TPrefix}/${StageAlias}`, T['length']> =>
  path.map((entry) => `${prefix}/${entry}` as `${TPrefix}/${StageAlias}`) as TupleOf<`${TPrefix}/${StageAlias}`, T['length']>;

export const buildStageAlias = (value: string): StageAlias => toAlias(value);

export const buildStageAliases = <const TAliases extends readonly string[]>(values: TAliases): readonly [...TAliases] =>
  values.map(toAlias) as readonly [...TAliases];

export const projectLayer = <TManifest extends RuntimeManifest>(
  manifest: TManifest,
  layer: number,
): RecursivePath<TManifest> => `${manifest.namespace}.${layer}` as RecursivePath<TManifest>;

export const projectLayers = <TManifest extends RuntimeManifest>(
  manifest: TManifest,
  layers: readonly number[],
): Readonly<Record<number, RecursivePath<TManifest>>> =>
  Object.fromEntries(layers.map((layer) => [layer, projectLayer(manifest, layer)])) as Readonly<Record<number, RecursivePath<TManifest>>>;

export const toRuntimeManifest = <
  TScope extends string,
  TTemplate extends string,
>(input: {
  readonly scope: TScope;
  readonly template: TTemplate;
  readonly aliases?: readonly string[];
}): RuntimeManifest<TScope, TTemplate> => buildRuntimeManifest({
  name: input.template,
  scope: input.scope,
  source: `source:${input.template}`,
  aliases: input.aliases ?? ['root'],
  mode: 'static',
});

export const runTopologyFromManifest = (manifest: RuntimeManifest): readonly StageAlias[] => manifest.aliases;
