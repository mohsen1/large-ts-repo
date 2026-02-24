import { FC, useMemo } from 'react';
import type { ConstellationMode, ConstellationStage } from '@domain/recovery-cockpit-constellation-core';

type ControlProps = {
  readonly mode: ConstellationMode;
  readonly total: number;
  readonly loading: boolean;
  readonly stages: readonly ConstellationStage[];
  readonly error?: string;
  readonly onStart: () => void;
  readonly onClearError?: () => void;
};

type Palette = {
  readonly border: string;
  readonly background: string;
  readonly foreground: string;
};

const palette: Record<ConstellationMode, Palette> = {
  analysis: { border: '#0ea5e9', background: '#e0f2fe', foreground: '#0f172a' },
  simulation: { border: '#22c55e', background: '#dcfce7', foreground: '#052e16' },
  execution: { border: '#fb7185', background: '#ffe4e6', foreground: '#3f1722' },
  stabilization: { border: '#a855f7', background: '#f3e8ff', foreground: '#3b0764' },
};

const keyValue = (label: string, value: string | number) => `${label}: ${value}`;

export const ConstellationControlCenter: FC<ControlProps> = ({
  mode,
  total,
  loading,
  stages,
  error,
  onStart,
  onClearError,
}) => {
  const theme = palette[mode];
  const groups = useMemo(() => {
    const grouped: Record<ConstellationStage, number> = {} as Record<ConstellationStage, number>;
    for (const stage of stages) {
      grouped[stage] = (grouped[stage] ?? 0) + 1;
    }
    return Object.entries(grouped)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([stage, count]) => ({ stage: stage as ConstellationStage, count }));
  }, [stages]);

  return (
    <section
      style={{
        border: `1px solid ${theme.border}`,
        background: theme.background,
        color: theme.foreground,
        padding: 14,
        borderRadius: 12,
      }}
    >
      <header style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Constellation control center</h3>
        <p style={{ margin: '4px 0 0', opacity: 0.8 }}>{keyValue('Mode', mode)}</p>
      </header>
      <p>{keyValue('Runs', total)}</p>
      <p>{keyValue('Stages', stages.length)}</p>
      <button type="button" onClick={onStart} disabled={loading} style={{ marginBottom: 8 }}>
        {loading ? 'Running…' : 'Run constellations'}
      </button>
      {onClearError && error ? (
        <button type="button" onClick={onClearError}>
          Clear error
        </button>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        {groups.map((item) => (
          <article key={item.stage} style={{ border: `1px dashed ${theme.border}`, borderRadius: 8, padding: 6 }}>
            <h4 style={{ margin: '0 0 4px' }}>{item.stage}</h4>
            <p style={{ margin: 0 }}>{item.count} entries</p>
          </article>
        ))}
      </div>
      {error ? <p style={{ color: '#b91c1c', marginTop: 10 }}>{error}</p> : null}
    </section>
  );
};
