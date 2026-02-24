import type { PluginName, StageBoundary } from './types';

export type PluginRegistryErrorCode =
  | 'duplicate-plugin'
  | 'missing-plugin'
  | 'misconfigured-plugin'
  | 'invalid-input';

export interface RegistryIssue {
  readonly code: PluginRegistryErrorCode;
  readonly plugin: string;
  readonly detail: string;
}

export interface RegistryPlugin<
  TName extends string,
  TStage extends StageBoundary<string, unknown, unknown>,
  TConfig extends Record<string, unknown> = {}
> {
  readonly metadata: {
    readonly name: TName;
    readonly description: string;
    readonly defaults?: TConfig;
  };
  readonly stage: TStage;
  readonly configSchema: TConfig;
  readonly supports: readonly TStage['name'][];
}

export type RegistryMap<
  T extends readonly RegistryPlugin<
    PluginName,
    StageBoundary<string, unknown, unknown>,
    Record<string, unknown>
  >[]
> = {
  readonly [K in T[number]['metadata']['name']]: Extract<T[number], { metadata: { name: K } }>;
}

export interface RegistryDiagnostics {
  readonly name: string;
  readonly issues: readonly RegistryIssue[];
}

type PluginNameUnion =
  PluginName | (string & {});

export interface TypedPluginRegistry<
  TPlugins extends readonly RegistryPlugin<
    PluginNameUnion,
    StageBoundary<string, unknown, unknown>,
    Record<string, unknown>
  >[]
> {
  readonly register: (plugin: TPlugins[number]) => TypedPluginRegistry<TPlugins>;
  readonly snapshot: () => RegistryDiagnostics;
  readonly find: (
    name: TPlugins[number]['metadata']['name']
  ) => (TPlugins[number] & { metadata: { name: TPlugins[number]['metadata']['name'] } }) | undefined;
}

function asIssue(name: string, code: PluginRegistryErrorCode, detail: string): RegistryIssue {
  return {
    code,
    plugin: name,
    detail
  };
}

export function createPluginRegistry<
  TPlugins extends readonly RegistryPlugin<
    PluginNameUnion,
    StageBoundary<string, unknown, unknown>,
    Record<string, unknown>
  >[]
>(...plugins: TPlugins): TypedPluginRegistry<TPlugins> {
  const registryPlugins = [...plugins];
  const issues: RegistryIssue[] = [];
  const seen = new Map<string, TPlugins[number]>();

  for (const plugin of registryPlugins) {
    if (seen.has(plugin.metadata.name)) {
      issues.push(asIssue(plugin.metadata.name, 'duplicate-plugin', `duplicate ${plugin.metadata.name}`));
    } else {
      seen.set(plugin.metadata.name, plugin);
    }
  }

  const lookup = new Map<string, TPlugins[number]>(
    registryPlugins.map((plugin) => [plugin.metadata.name, plugin] as const)
  );

  const snapshot = () => ({
    name: `${lookup.size} plugins`,
    issues: issues as RegistryDiagnostics['issues']
  });

  return {
    register(plugin) {
      if (seen.has(plugin.metadata.name)) {
        issues.push(asIssue(plugin.metadata.name, 'duplicate-plugin', `duplicate ${plugin.metadata.name}`));
      } else {
        seen.set(plugin.metadata.name, plugin);
      }
      registryPlugins.push(plugin);
      lookup.set(plugin.metadata.name, plugin);
      return this as unknown as TypedPluginRegistry<TPlugins>;
    },
    snapshot,
    find(name) {
      const plugin = lookup.get(String(name));
      if (!plugin) {
        return undefined;
      }
      return plugin as TPlugins[number] & { metadata: { name: TPlugins[number]['metadata']['name'] } };
    }
  };
}
