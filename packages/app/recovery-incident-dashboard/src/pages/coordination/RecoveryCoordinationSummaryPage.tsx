import { useMemo } from 'react';
import { useCoordinationCommandCenter } from '../../hooks/coordination/useCoordinationCommandCenter';

interface SummaryTile {
  readonly label: string;
  readonly value: string;
  readonly tone: 'good' | 'warn' | 'bad';
}

const toneClass = (tone: SummaryTile['tone']): string => `tone-${tone}`;

export const RecoveryCoordinationSummaryPage = () => {
  const { latestReport, commandInputs, selection, state, reload } = useCoordinationCommandCenter({
    tenant: 'summary',
    programId: 'coord-summary',
  });

  const tiles = useMemo<SummaryTile[]>(() => {
    return [
      {
        label: 'Latest run',
        value: latestReport ? latestReport.runId : 'none',
        tone: latestReport ? 'good' : 'warn',
      },
      {
        label: 'Decision',
        value: latestReport ? latestReport.selection.decision : 'none',
        tone: latestReport && latestReport.selection.decision === 'approved' ? 'good' : latestReport?.selection.decision === 'deferred' ? 'warn' : 'bad',
      },
      {
        label: 'Queue',
        value: String(commandInputs.length),
        tone: commandInputs.length > 2 ? 'warn' : 'good',
      },
      {
        label: 'Ready',
        value: state.canExecute ? 'true' : 'false',
        tone: state.canExecute ? 'good' : 'bad',
      },
      {
        label: 'Signals',
        value: selection ? String(selection.blockedConstraints.length) : '0',
        tone: selection && selection.blockedConstraints.length ? 'warn' : 'good',
      },
    ];
  }, [latestReport, commandInputs.length, selection, state.canExecute]);

  return (
    <main>
      <header>
        <h1>Coordination Summary</h1>
        <button onClick={reload}>Reload</button>
      </header>
      <ul>
        {tiles.map((tile) => (
          <li key={tile.label} className={toneClass(tile.tone)}>
            <span>{tile.label}</span>
            <strong>{tile.value}</strong>
          </li>
        ))}
      </ul>
      {latestReport ? (
        <section>
          <h2>Latest report</h2>
          <p>{latestReport.tenant}</p>
          <p>{latestReport.selection.reasons.join(', ')}</p>
        </section>
      ) : null}
    </main>
  );
};
