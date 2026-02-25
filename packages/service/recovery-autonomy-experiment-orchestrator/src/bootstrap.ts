import { withBrand } from '@shared/core';
import type { PluginId, PluginDefinition } from './types';

const pluginList = [
  {
    id: 'plugin:seed:prepare',
    kind: 'plugin:prepare' as const,
    phase: 'prepare',
    priority: 10,
    transform: async (input: { readonly count: number }, _context: { readonly runId: string }) => ({
      ...input,
      step: 'prepare',
    }),
  },
  {
    id: 'plugin:seed:inject',
    kind: 'plugin:inject' as const,
    phase: 'inject',
    priority: 15,
    transform: async (input: { readonly count: number }, _context: { readonly runId: string }) => ({
      ...input,
      step: 'inject',
    }),
  },
  {
    id: 'plugin:seed:observe',
    kind: 'plugin:observe' as const,
    phase: 'observe',
    priority: 20,
    transform: async (input: { readonly count: number }, _context: { readonly runId: string }) => ({
      ...input,
      step: 'observe',
    }),
  },
] as const;

type SeedPlugin = {
  readonly id: string;
  readonly kind: `plugin:${string}`;
  readonly phase: 'prepare' | 'inject' | 'observe';
  readonly priority: 10 | 15 | 20;
  readonly transform: (
    input: { readonly count: number },
    context: { readonly runId: string },
  ) => Promise<{ readonly step: string; readonly count: number }>;
};

const typedPlugins = pluginList as readonly SeedPlugin[];

type SeedRuntimePlugin = PluginDefinition<{ readonly count: number }, { readonly step: string; readonly count: number }>;

export const BASELINE_PLUGINS = typedPlugins.map(
  (plugin) =>
    ({
      ...plugin,
      id: withBrand(plugin.id, 'PluginId'),
    }) as SeedRuntimePlugin,
);

type SeedLoaded = {
  readonly pluginId: PluginId;
  readonly loadedAt: string;
};

const resolvePlugin = async (plugin: { readonly id: PluginId }): Promise<SeedLoaded> => ({
  pluginId: plugin.id,
  loadedAt: new Date().toISOString(),
});

export const withPlugins = async (): Promise<readonly SeedLoaded[]> => {
  return Promise.all(typedPlugins.map(async (plugin) => resolvePlugin({ id: withBrand(plugin.id, 'PluginId') })));
};
