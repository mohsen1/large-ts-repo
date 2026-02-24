import { useMemo, useState } from 'react';
import type { SagaPluginStatus } from '../types';

const basePlugins = [
  { plugin: 'validation', enabled: true, status: 'running' as const },
  { plugin: 'replay', enabled: true, status: 'running' as const },
  { plugin: 'dispatch', enabled: true, status: 'running' as const },
] as const satisfies readonly SagaPluginStatus[];

export const useSagaPlugins = (): {
  readonly plugins: readonly SagaPluginStatus[];
  readonly flip: (name: string) => void;
} => {
  const [plugins, setPlugins] = useState<readonly SagaPluginStatus[]>(basePlugins);

  const sorted = useMemo(
    () => [...plugins].sort((left, right) => left.plugin.localeCompare(right.plugin)) as readonly SagaPluginStatus[],
    [plugins],
  );

  const flip = (name: string): void => {
    setPlugins((current) =>
      current.map((plugin) =>
        plugin.plugin === name
          ? {
              ...plugin,
              enabled: !plugin.enabled,
              status: plugin.status === 'running' ? 'stopped' : 'running',
            }
          : plugin,
      ),
    );
  };

  return { plugins: sorted, flip };
};
