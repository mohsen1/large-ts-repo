import { useMemo } from 'react';
import {
  type PlaybookAutomationPlugin,
  type PluginMap,
  AutomationPluginRegistry,
} from '@domain/recovery-playbook-orchestration-core';

export interface PluginRecord {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export const usePlaybookPlugins = <TPlugins extends readonly PlaybookAutomationPlugin<unknown, unknown, unknown>[]>(
  plugins: TPlugins,
): { records: readonly PluginRecord[]; map: PluginMap<TPlugins> } => {
  const registry = useMemo(() => new AutomationPluginRegistry(plugins), [plugins]);
  const records = useMemo(
    () =>
      registry.list().map((plugin: TPlugins[number]) => ({
        id: String(plugin.id),
        name: plugin.kind,
        enabled: plugin.capabilities.length > 0,
      })),
    [registry],
  );

  return { records, map: registry.registry };
};
