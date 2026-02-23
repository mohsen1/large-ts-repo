import { useMemo } from 'react';
import { usePlaybookHealthProjection } from '../hooks/usePlaybookHealthProjection';
import { usePlaybookPolicyMatrix } from '../hooks/usePlaybookPolicyMatrix';
import type { DriftSignal, RecoveryPlaybookModel } from '@domain/recovery-playbook-orchestration';

type Props = {
  readonly playbook: RecoveryPlaybookModel;
  readonly signals: readonly DriftSignal[];
  readonly onRun: () => void;
  readonly onRefresh: () => void;
  readonly loading: boolean;
};

export const PlaybookControlBoard = ({ playbook, signals, onRun, onRefresh, loading }: Props) => {
  const { indicators, isHighRisk, trend, score } = usePlaybookHealthProjection({ playbook, signals });
  const matrix = usePlaybookPolicyMatrix({ policies: Object.values(playbook.policies) });

  const status = useMemo(
    () => (isHighRisk ? 'high-risk posture' : 'stable'),
    [isHighRisk],
  );

  return (
    <section className='playbook-control-board'>
      <header>
        <h2>Recovery playbook orchestration lab</h2>
        <p>{playbook.title}</p>
      </header>

      <div className='metric-strip'>
        <div>
          <h3>Current score</h3>
          <strong>{Math.round(score * 10)}</strong>
        </div>
        <div>
          <h3>Trend</h3>
          <strong>{trend}</strong>
        </div>
        <div>
          <h3>Status</h3>
          <strong>{status}</strong>
        </div>
      </div>

      <article className='policy-panel'>
        <h3>Policy matrix</h3>
        <p>Policies: {matrix.policyCount}</p>
        <p>High complexity policies: {matrix.policyDensity.high}</p>
        <ul>
          {matrix.rows.map((row) => (
            <li key={row.id}>
              <span>{row.name}</span>
              <span>{row.owner}</span>
              <span>{row.complexity}</span>
            </li>
          ))}
        </ul>
      </article>

      <article className='indicators'>
        <h3>Indicators</h3>
        {indicators.map((indicator) => (
          <p key={indicator.key}>
            {indicator.key}: {indicator.score} ({indicator.band})
          </p>
        ))}
      </article>

      <footer>
        <button type='button' disabled={loading} onClick={onRun}>
          {loading ? 'Running…' : 'Run simulation'}
        </button>
        <button type='button' onClick={onRefresh}>
          Refresh summary
        </button>
      </footer>
    </section>
  );
};
