import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildCommandManifest,
  commandEnvelope,
  commandPath,
  createCommandRuntime,
  isCommandEvent,
  normalizeCommandName,
} from '@domain/recovery-ecosystem-core';
import type { NamespaceTag, PolicyId } from '@domain/recovery-ecosystem-core';

interface PluginDefinition {
  readonly name: string;
  readonly namespace: NamespaceTag;
  readonly dependsOn: readonly string[];
}

interface PluginRecord {
  readonly name: string;
  readonly namespace: NamespaceTag;
  readonly signature: string;
  readonly dependsOn: readonly string[];
  readonly manifest: string;
}

interface UsePluginState {
  readonly available: readonly PluginRecord[];
  readonly selected: readonly string[];
  readonly loading: boolean;
  readonly selectedManifest: string;
}

interface UsePluginActions {
  readonly refresh: () => Promise<void>;
  readonly select: (name: string, enabled: boolean) => void;
  readonly snapshot: () => string;
}

const runtime = createCommandRuntime([], 'namespace:recovery-ecosystem' as NamespaceTag);

const builtin: readonly PluginDefinition[] = [
  {
    name: 'seed-check',
    namespace: 'namespace:seed' as NamespaceTag,
    dependsOn: [],
  },
  {
    name: 'policy-enforce',
    namespace: 'namespace:policy' as NamespaceTag,
    dependsOn: ['seed-check'],
  },
  {
    name: 'signal-propagate',
    namespace: 'namespace:signal' as NamespaceTag,
    dependsOn: ['policy-enforce'],
  },
  {
    name: 'artifact-commit',
    namespace: 'namespace:artifact' as NamespaceTag,
    dependsOn: ['signal-propagate'],
  },
];

const normalizeEntries = (tenantId: string): readonly { readonly name: string; readonly namespace: NamespaceTag; readonly dependsOn: readonly string[]; readonly manifest: string; readonly signature: string }[] => {
  const base = commandPath('namespace', 'recovery', tenantId).split('/').filter(Boolean);
  return base.map((item, index) => ({
    name: normalizeCommandName(item),
    namespace: `namespace:${item}` as NamespaceTag,
    dependsOn: index === 0 ? [] : builtin[index - 1]?.dependsOn ?? [],
    manifest: `${normalizeCommandName(item)}@${tenantId}`,
    signature: isCommandEvent(`event:${item}`) ? 'command' : 'other',
  }));
};

const pluginManifest = builtin.map((entry) => buildCommandManifest(entry.name, entry.namespace));

const asPolicyRecords = (policies: readonly PolicyId[]) =>
  policies
    .map((policy) => ({ policyId: policy, enabled: true }))
    .toSorted();

const createWorkspaceSummary = (selected: readonly string[]): string =>
  selected
    .map((entry) => `policy:${entry}`)
    .toSorted()
    .join('|');

export const useEcosystemPlugins = (tenantId: string): UsePluginState & UsePluginActions => {
  const [selected, setSelected] = useState<readonly string[]>(() => builtin.map((entry) => entry.name));
  const [available, setAvailable] = useState<readonly PluginRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const normalized = normalizeEntries(tenantId).map((entry) => {
        const record: PluginRecord = {
          name: entry.name,
          namespace: entry.namespace,
          signature: entry.signature,
          dependsOn: entry.dependsOn,
          manifest: JSON.stringify(
            commandEnvelope(entry.name, tenantId, entry.namespace, {
              tenant: tenantId,
              index: available.length,
              step: 'refresh',
            }),
          ),
        };
        return record;
      });
      setAvailable(normalized.toSorted((left, right) => left.name.localeCompare(right.name)));
    } finally {
      setLoading(false);
    }
  }, [tenantId, available.length]);

  const select = useCallback((name: string, enabled: boolean) => {
    setSelected((previous) => {
      const exists = previous.includes(name);
      if (enabled && !exists) {
        return [...previous, name].sort();
      }
      if (!enabled && exists) {
        return previous.filter((entry) => entry !== name);
      }
      return previous;
    });
  }, []);

  const snapshot = useCallback((): string => {
    const summary = createWorkspaceSummary(selected);
    const manifest = pluginManifest
      .map((entry) => `${entry.name}:${entry.namespace}`)
      .toSorted()
      .join('|');
    const policies = asPolicyRecords(selected.map((entry) => createWorkspacePolicy(entry)));
    void policies;
    return `${tenantId}::${summary}::${manifest}::${selected.length}`;
  }, [selected, tenantId]);

  useEffect(() => {
    void refresh();
    runtime.commands();
  }, [refresh]);

  const selectedManifest = useMemo(() => createWorkspaceSummary(selected), [selected]);

  return {
    available,
    selected,
    loading,
    refresh,
    select,
    snapshot,
    selectedManifest,
  };
};

export const createWorkspacePolicy = (value: string): PolicyId => `policy:${value}` as PolicyId;

export const createPluginRecord = (entry: PluginDefinition): PluginRecord => ({
  name: entry.name,
  namespace: entry.namespace,
  signature: 'command',
  dependsOn: entry.dependsOn,
  manifest: `command:${entry.name}`,
});
