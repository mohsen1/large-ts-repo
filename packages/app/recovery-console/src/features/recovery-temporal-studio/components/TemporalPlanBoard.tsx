import { memo } from 'react';
import type { FC, ReactNode } from 'react';
import {
  type TemporalStudioMode,
  type TemporalStudioRow,
  type TemporalStudioState,
  toRowView,
  type TemporalStudioRowView,
  modePalette,
} from '../types';

export interface TemporalPlanBoardProps {
  readonly state: TemporalStudioState;
  readonly onSelect?: (runId: TemporalStudioRow['runId']) => void;
  readonly onModeChange: (mode: TemporalStudioMode) => void;
}

const RowStateIcon: FC<{ readonly state: TemporalStudioRowView['status'] }> = ({ state }) => {
  const symbol = state === 'complete' ? '✓' : state === 'running' ? '▸' : state === 'failed' ? '✕' : '·';
  return <span aria-label={`state-${state}`}>{symbol}</span>;
};

interface BoardRowProps {
  readonly row: TemporalStudioRowView;
  readonly onSelect?: (runId: TemporalStudioRow['runId']) => void;
  readonly selected: boolean;
}

const BoardRow = memo<BoardRowProps>(({ row, onSelect, selected }) => {
  const statusClass = row.status === 'running' ? 'running' : row.status === 'complete' ? 'complete' : 'queued';
  return (
    <button
      type="button"
      onClick={() => {
        onSelect?.(row.runId);
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr 160px 100px',
        width: '100%',
        padding: '0.5rem',
        border: selected ? '1px solid #60a5fa' : '1px solid #334155',
        borderRadius: '0.4rem',
        marginBottom: '0.5rem',
        color: 'white',
        background: '#0f172a',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span>
        <RowStateIcon state={row.status} />
      </span>
      <span>
        <strong>{row.planName}</strong>
        <br />
        <small>{row.tenant}</small>
      </span>
      <span>{row.candidateNames.length} candidates</span>
      <span className={statusClass}>{row.status}</span>
    </button>
  );
});

BoardRow.displayName = 'BoardRow';

export const TemporalPlanBoard: FC<TemporalPlanBoardProps> = ({ state, onSelect, onModeChange }) => {
  const palette = modePalette[state.mode];
  const rows = state.rows.map((row) => toRowView(row));

  const modeButtons = ['plan', 'runtime', 'signals', 'diagnostics'] as TemporalStudioMode[];

  return (
    <section
      style={{
        border: `1px solid ${palette.accent}`,
        borderRadius: '0.5rem',
        padding: '1rem',
        background: '#111827',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, color: palette.text, letterSpacing: '0.02em' }}>Temporal Studio Plan Board</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {modeButtons.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                onModeChange(mode);
              }}
              style={{
                border: '1px solid rgba(148,163,184,0.35)',
                background: mode === state.mode ? palette.accent : 'transparent',
                color: 'white',
                padding: '0.35rem 0.55rem',
                borderRadius: '0.35rem',
                cursor: 'pointer',
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </header>
      <div>
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          rows.map((row) => (
            <BoardRow
              key={String(row.runId)}
              row={row}
              onSelect={onSelect}
              selected={state.selectedRun === row.runId}
            />
          ))
        )}
      </div>
    </section>
  );
};

const EmptyState = () => {
  const lines = ['No run records available', 'Open controls to start a temporal run', 'Signals and stages will materialize after execution'];
  return (
    <ul style={{ paddingLeft: '1rem', color: '#94a3b8', margin: 0 }}>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
};

export const TemporalBoardLegend = (): ReactNode => {
  const items = [
    { state: 'queued', label: 'Queued' },
    { state: 'running', label: 'Running' },
    { state: 'complete', label: 'Complete' },
    { state: 'failed', label: 'Failed' },
  ];

  return (
    <aside style={{ marginTop: '0.75rem', color: '#cbd5e1', fontSize: '0.85rem' }}>
      <p style={{ margin: 0 }}>Legend:</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: '1rem' }}>
        {items.map((item) => (
          <li key={item.state} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <strong>{item.state}</strong>
            <RowStateIcon state={item.state as 'queued'} />
          </li>
        ))}
      </ul>
    </aside>
  );
};
