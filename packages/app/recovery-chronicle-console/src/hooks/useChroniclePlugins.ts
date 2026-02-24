import { useMemo } from 'react';
import type { ChroniclePluginDescriptor, ChronicleTenantId } from '@domain/recovery-chronicle-core';
import { buildAdapter } from '@service/recovery-chronicle-orchestrator';
import type { PluginCardState } from '../types';

export interface UseChroniclePluginsResult {
  readonly ready: boolean;
  readonly plugins: readonly PluginCardState[];
  readonly hasFailed: boolean;
  readonly failedPlugins: readonly PluginCardState[];
}

export const useChroniclePlugins = (
  tenant: ChronicleTenantId,
  plugins: readonly ChroniclePluginDescriptor[],
): UseChroniclePluginsResult => {
  useMemo(() => buildAdapter({ tenant, route: 'chronicle://workspace' }), [tenant]);

  const mapped = useMemo(() => {
    return plugins.map((plugin): PluginCardState => ({
      id: plugin.id,
      name: plugin.name,
      ready: true,
      status: plugin.name.length > 0 ? 'active' : 'ready',
    }));
  }, [plugins]);

  const failedPlugins = mapped.filter((plugin) => plugin.status === 'failed');

  return {
    ready: mapped.length > 0,
    plugins: mapped,
    hasFailed: failedPlugins.length > 0,
    failedPlugins,
  };
};
