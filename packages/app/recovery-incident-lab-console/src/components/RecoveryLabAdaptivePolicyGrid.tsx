import { type ReactElement, useMemo } from 'react';
import { useRecoveryLabAdaptiveOrchestration } from '../hooks/useRecoveryLabAdaptiveOrchestration';
import type { CampaignDiagnostic } from '@domain/recovery-lab-adaptive-orchestration';

interface MatrixCell {
  readonly key: string;
  readonly phase: string;
  readonly severity: number;
  readonly count: number;
}

const Cell = ({ cell, onPick }: { readonly cell: MatrixCell; readonly onPick: (value: string) => void }): ReactElement => {
  const tone = cell.severity >= 8 ? 'high' : cell.severity >= 4 ? 'med' : 'low';
  return (
    <button type="button" className={`cell ${tone}`} onClick={() => onPick(cell.key)}>
      <p>{cell.phase}</p>
      <p>{cell.key}</p>
      <p>#{cell.count}</p>
      <p>{cell.severity}</p>
    </button>
  );
};

export const RecoveryLabAdaptivePolicyGrid = (): ReactElement => {
  const { state, eventText, hasDiagnostics, latestSnapshot } = useRecoveryLabAdaptiveOrchestration();
  const byKey = useMemo(() => {
    const map = new Map<string, MatrixCell>();

    for (const diagnostic of state.diagnostics) {
      const key = diagnostic.pluginId;
      const current = map.get(key);
      const phase = diagnostic.phase;
      const count = (current?.count ?? 0) + 1;
      const severity = phase === 'verify' ? 9 : phase === 'execute' ? 7 : phase === 'synthesize' ? 3 : 5;

      map.set(key, {
        key,
        phase,
        count,
        severity,
      });
    }

    return [...map.values()];
  }, [state.diagnostics]);

  const rows = useMemo(() => {
    const sorted = byKey.toSorted((left, right) => right.severity - left.severity);
    const rowCount = Math.max(1, Math.ceil(sorted.length / 3));
    const output: MatrixCell[][] = [];

    for (let index = 0; index < rowCount; index++) {
      output.push(sorted.slice(index * 3, index * 3 + 3));
    }

    return output;
  }, [byKey]);

  const pick = (key: string) => {
    const item = state.diagnostics.find((entry) => entry.pluginId === key);
    if (!item) {
      return;
    }
    console.log('selected', item);
  };

  return (
    <section className="adaptive-policy-grid">
      <header>
        <h3>Policy matrix</h3>
        <small>selected: {latestSnapshot ? latestSnapshot.key : 'none'}</small>
      </header>
      <p>Has diagnostics: {hasDiagnostics ? 'yes' : 'no'}</p>
      <p>events: {eventText.slice(0, 120) || 'none'}</p>
      <div className="grid">
        {rows.map((row, rowIndex) => (
          <div key={`${rowIndex}`} className="grid-row">
            {row.map((cell) => (
              <Cell key={`${cell.key}-${rowIndex}`} cell={cell} onPick={pick} />
            ))}
          </div>
        ))}
      </div>
      {rows.length === 0 && <p>No policy signals</p>}
      <ul>
        {state.diagnostics
          .slice(0, 10)
          .map((diagnostic: CampaignDiagnostic) => (
            <li key={`${diagnostic.at}-${diagnostic.pluginId}`}>
              {diagnostic.at} {diagnostic.phase} {diagnostic.pluginId}
            </li>
          ))}
      </ul>
    </section>
  );
};
