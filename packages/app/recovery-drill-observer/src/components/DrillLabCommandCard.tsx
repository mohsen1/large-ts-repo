import { useMemo, useState } from 'react';
import type { DrillRunSnapshot } from '@domain/recovery-drill-lab';

interface Props {
  readonly snapshot: DrillRunSnapshot;
  readonly onSelect?: (snapshot: DrillRunSnapshot) => void;
}

export const DrillLabCommandCard = ({ snapshot, onSelect }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const header = useMemo(() => {
    const risk = Math.round(snapshot.riskBudgetPercent * 100);
    return `${snapshot.scenarioName} · ${snapshot.status} · Risk ${risk}%`;
  }, [snapshot]);

  return (
    <article style={{ border: '1px solid #3a3a3a', borderRadius: 10, padding: 10, background: '#111', color: '#f8f8f8' }}>
      <h3>{header}</h3>
      <p>Id: {snapshot.id}</p>
      <p>Updated: {snapshot.updatedAt}</p>
      <p>Signals: {snapshot.signals.length}</p>
      <button type="button" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Hide checkpoints' : 'Show checkpoints'}
      </button>
      {expanded ? (
        <ul>
          {snapshot.steps.map((step) => (
            <li key={step.id}>
              #{step.order} {step.family} / {step.name} · {step.status} · {step.checkpoints.length} checkpoints
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" onClick={() => onSelect?.(snapshot)}>
        Open snapshot
      </button>
    </article>
  );
};
