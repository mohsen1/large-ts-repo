import { useMemo, type ReactElement } from 'react';
import type { PluginNode } from '@domain/recovery-ecosystem-analytics';

interface StudioCanvasProps {
  readonly plugins: readonly PluginNode[];
  readonly selected: string;
  readonly onSelect: (plugin: string) => void;
}

const normalizeLabel = (value: string): string => value.replace(/^plugin:/, '').replace(/-/g, ' ');

const Node = ({ id, selected, onSelect }: { readonly id: string; readonly selected: boolean; readonly onSelect: () => void }) => {
  const title = normalizeLabel(id);
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} style={{
      padding: '0.5rem',
      border: selected ? '2px solid #4f46e5' : '1px solid #64748b',
      borderRadius: 6,
      background: selected ? '#e0e7ff' : '#f8fafc',
      minWidth: 160,
      textAlign: 'left',
      margin: 4,
    }}>
      <strong>{title}</strong>
      <div style={{ opacity: 0.8, fontSize: 12 }}>{id}</div>
    </button>
  );
};

export const PluginStudioCanvas = ({ plugins, selected, onSelect }: StudioCanvasProps): ReactElement => {
  const grouped = useMemo(() => plugins.toSorted((left, right) => left.name.localeCompare(right.name)), [plugins]);
  return (
    <section>
      <h3>Plugin Studio Canvas</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {grouped.map((entry) => (
          <Node
            key={entry.name}
            id={entry.name}
            selected={selected === entry.name}
            onSelect={() => onSelect(entry.name)}
          />
        ))}
      </div>
    </section>
  );
};

export const PluginStudioSummary = ({
  title,
  count,
  namespace,
}: {
  readonly title: string;
  readonly count: number;
  readonly namespace: string;
}): ReactElement => (
  <article>
    <h4>{title}</h4>
    <p>
      namespace={namespace}
      <br />
      count={count}
    </p>
  </article>
);
