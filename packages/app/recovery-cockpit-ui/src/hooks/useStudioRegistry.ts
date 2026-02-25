import { useMemo } from 'react';
import { type PluginId, type StudioPluginDefinition } from '@shared/cockpit-studio-core';

export type RegistrySummary = {
  readonly total: number;
  readonly byStage: Readonly<Record<string, number>>;
  readonly byTenant: readonly string[];
  readonly topPlugins: readonly PluginId[];
};

export type RegistryState = {
  readonly hasEntries: boolean;
  readonly summary: RegistrySummary;
  readonly byDomain: Readonly<Record<string, readonly PluginId[]>>;
};

const toSortedValues = (entries: Readonly<Record<string, readonly PluginId[]>>): readonly PluginId[] =>
  Object.values(entries).flat().toSorted((left, right) => left.localeCompare(right));

export const summarizePluginRegistry = <TPlugins extends readonly StudioPluginDefinition[]>(
  plugins: TPlugins,
): RegistrySummary => {
  const byStage = plugins.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.kind] = (acc[entry.kind] ?? 0) + 1;
    return acc;
  }, {});

  const ranked = plugins
    .map((entry) => entry.id)
    .toSorted((left, right) => (byStage[right] ?? 0) - (byStage[left] ?? 0) || left.localeCompare(right));

  return {
    total: plugins.length,
    byStage,
    byTenant: [...new Set(plugins.map((entry) => entry.domain))].toSorted(),
    topPlugins: ranked.slice(0, 8),
  };
};

export const useStudioRegistry = <TPlugins extends readonly StudioPluginDefinition[]>(plugins: TPlugins): RegistryState => {
  return useMemo(() => {
    const byDomain: Record<string, PluginId[]> = {};
    for (const entry of plugins) {
      const domain = entry.domain;
      const bucket = byDomain[domain] ?? [];
      byDomain[domain] = [...bucket, entry.id];
    }
    const summary = summarizePluginRegistry(plugins);
    toSortedValues(byDomain);
    return {
      hasEntries: plugins.length > 0,
      summary,
      byDomain,
    };
  }, [plugins]);
};

export const buildRuntimeMatrix = <TPlugins extends readonly StudioPluginDefinition[]>(
  plugins: TPlugins,
): Readonly<Record<string, ReadonlyArray<PluginId>>> => {
  const matrix = plugins.reduce<Record<string, PluginId[]>>((acc, plugin) => {
    const stage = plugin.kind;
    const bucket = acc[stage] ?? [];
    bucket.push(plugin.id);
    acc[stage] = bucket;
    return acc;
  }, {});
  return Object.fromEntries(Object.entries(matrix).map(([stage, ids]) => [stage, ids.toSorted()]));
};
