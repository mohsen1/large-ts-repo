import { useMemo } from 'react';

export interface RegistryRecord {
  readonly kind: string;
  readonly pluginId: string;
  readonly enabled: boolean;
}

export interface StressLabWorkflowRegistryProps {
  readonly registry: readonly RegistryRecord[];
  readonly activeKinds: readonly string[];
  readonly onToggle: (kind: string) => void;
}

const filterActive = (records: readonly RegistryRecord[], activeKinds: readonly string[]) =>
  records.map((entry) => ({ ...entry, enabled: activeKinds.includes(entry.kind) }));

export const StressLabWorkflowRegistry = ({ registry, activeKinds, onToggle }: StressLabWorkflowRegistryProps) => {
  const merged = useMemo(() => filterActive(registry, activeKinds), [registry, activeKinds]);
  return (
    <section>
      <h2>Workflow Registry</h2>
      <ul>
        {merged.map((entry) => (
          <li key={entry.pluginId}>
            <label>
              <input
                type="checkbox"
                checked={entry.enabled}
                onChange={() => onToggle(entry.kind)}
              />
              <span>
                {entry.kind} &mdash; {entry.pluginId}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
};

const defaultToggle = (kind: string) => kind;

export const buildRegistryFromKinds = (entries: readonly string[]): RegistryRecord[] =>
  entries.map((kind) => ({
    kind,
    pluginId: `plugin-${kind}`,
    enabled: kind.includes('collector') || kind.includes('finalizer'),
  }));

export const summarizeRegistry = (entries: readonly RegistryRecord[]) =>
  entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.enabled ? 'enabled' : 'disabled'] = (acc[entry.enabled ? 'enabled' : 'disabled'] ?? 0) + 1;
    return acc;
  }, {});

export const isAllEnabled = (entries: readonly RegistryRecord[]): boolean =>
  entries.every((entry) => entry.enabled);

export const StressLabWorkflowRegistryCompact = ({
  activeKinds,
}: {
  readonly activeKinds: readonly string[];
}) => {
  const records = useMemo(() => buildRegistryFromKinds(activeKinds), [activeKinds]);
  const summary = summarizeRegistry(records);
  return (
    <section>
      <div>
        enabled {summary.enabled ?? 0} / disabled {summary.disabled ?? 0}
      </div>
      <div>
        {records.map((entry) => (
          <span key={entry.pluginId} style={{ marginRight: 8 }}>
            {defaultToggle(entry.pluginId)} {entry.enabled ? '🟢' : '⚪'}
          </span>
        ))}
      </div>
    </section>
  );
};
