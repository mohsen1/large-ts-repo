import type { ScenarioLabWorkspace } from '../hooks/useRecoveryScenarioLabWorkspace';

interface ScenarioRiskBoardProps {
  readonly workspace: ScenarioLabWorkspace;
  readonly onSelectTemplate: (templateId: string) => void;
}

const stateColor = (value: number): string => {
  if (value >= 75) return '#34d399';
  if (value >= 50) return '#f59e0b';
  if (value >= 25) return '#f97316';
  return '#f43f5e';
};

export const ScenarioRiskBoard = ({ workspace, onSelectTemplate }: ScenarioRiskBoardProps) => {
  const templateRows = [
    {
      name: workspace.plan?.blueprintId ?? 'waiting',
      score: workspace.riskScore,
    },
  ];

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 12, padding: '0.75rem', background: '#0f172a' }}>
      <h2>Risk board</h2>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {templateRows.map((entry) => (
          <article
            key={entry.name}
            style={{
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: '0.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <span>{entry.name}</span>
            <strong style={{ color: stateColor(entry.score) }}>{entry.score.toFixed(0)}/100</strong>
            <button type="button" onClick={() => onSelectTemplate(`${entry.name}-select`)}>
              Select fallback
            </button>
          </article>
        ))}
      </div>
      <dl style={{ marginTop: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <dt>Ready actions</dt>
          <dd>{workspace.windowsReady ? workspace.windows.length : 0}</dd>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <dt>Runs emitted</dt>
          <dd>{workspace.runs.length}</dd>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <dt>Signal snapshots</dt>
          <dd>{workspace.snapshots.length}</dd>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <dt>Replay sample size</dt>
          <dd>{workspace.replayCount}</dd>
        </div>
      </dl>
    </section>
  );
};
