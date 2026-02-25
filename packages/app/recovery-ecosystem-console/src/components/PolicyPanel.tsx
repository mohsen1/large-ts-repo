import { memo, type ReactElement, useMemo } from 'react';
import { useEcosystemPlugins } from '../hooks/useEcosystemPlugins';

export interface PolicyPanelProps {
  readonly tenantId: string;
  readonly onSelect: (policy: string, enabled: boolean) => void;
}

const PolicyPill = memo(({ name, enabled, onToggle }: { readonly name: string; readonly enabled: boolean; readonly onToggle: (enabled: boolean) => void }): ReactElement => {
  return (
    <li className={`policy-pill ${enabled ? 'policy-pill-on' : 'policy-pill-off'}`}>
      <span>{name}</span>
      <button type="button" onClick={() => onToggle(!enabled)}>
        {enabled ? 'disable' : 'enable'}
      </button>
    </li>
  );
});

export const PolicyPanel = ({ tenantId, onSelect }: PolicyPanelProps): ReactElement => {
  const { available, selected, loading } = useEcosystemPlugins(tenantId);

  const sorted = useMemo(() => available.toSorted((left, right) => left.name.localeCompare(right.name)), [available]);

  const rows = sorted.map((entry) => (
    <PolicyPill
      key={entry.name}
      name={entry.name}
      enabled={selected.includes(entry.name)}
      onToggle={(enabled) => onSelect(entry.name, enabled)}
    />
  ));

  return (
    <section className="policy-panel">
      <header>
        <h2>Policies</h2>
        <p>{loading ? 'loading...' : `${rows.length} policies`}</p>
      </header>
      <ul>{rows}</ul>
    </section>
  );
};

export const PolicyDigest = ({ value }: { readonly value: string }): ReactElement => {
  const digest = useMemo(() => value.split('::')[1] ?? 'empty', [value]);
  return <code>{digest}</code>;
};

