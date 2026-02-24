import { POLICY_PLUGIN_NAMES, buildBuiltinPlugins } from './policy-catalog';
import type { CommandPluginList, PluginManifest } from './policy-catalog';
import { DEFAULT_ORCHESTRATION_POLICY } from './types';

export const TIMELINE_POLICY_MANIFEST: PluginManifest = await (async (): Promise<PluginManifest> => {
  const pluginEntries = buildBuiltinPlugins(DEFAULT_ORCHESTRATION_POLICY);
  const filtered = pluginEntries.filter((plugin) =>
    POLICY_PLUGIN_NAMES.includes(plugin.name as (typeof POLICY_PLUGIN_NAMES)[number]),
  );

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      resolve();
    }, 0);
  });

  return {
    version: '1.0.0',
    namespace: 'recovery/timeline',
    entries: filtered satisfies CommandPluginList,
  };
})();
