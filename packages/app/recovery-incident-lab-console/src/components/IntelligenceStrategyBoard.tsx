import { memo, type ReactElement } from 'react';
import type {
  StrategyPlan,
  StrategyTuple,
} from '@domain/recovery-lab-intelligence-core';

interface IntelligenceStrategyBoardProps {
  readonly plan?: StrategyPlan;
  readonly tuple: StrategyTuple;
  readonly loading?: boolean;
  readonly onRefresh: () => void;
}

const rowFor = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'empty';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object' && Object.keys(value).length > 0) {
    return JSON.stringify(value);
  }
  return String(value);
};

export const IntelligenceStrategyBoard = memo(
  ({ plan, tuple, loading, onRefresh }: IntelligenceStrategyBoardProps): ReactElement => {
    return (
      <section className="intelligence-strategy-board">
        <header className="intelligence-strategy-board__header">
          <h2>Intelligence Strategy Board</h2>
          <button type="button" onClick={onRefresh} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh Plan'}
          </button>
        </header>
        <dl className="intelligence-strategy-board__meta">
          <div>
            <dt>Current tuple</dt>
            <dd>{tuple.join(' / ')}</dd>
          </div>
          <div>
            <dt>Steps</dt>
            <dd>{plan?.steps.length ?? 0}</dd>
          </div>
          <div>
            <dt>Mode lanes</dt>
            <dd>{plan?.lanes.join(', ') || 'unset'}</dd>
          </div>
          <div>
            <dt>Metadata entries</dt>
            <dd>{plan ? Object.keys(plan.metadata).length : 0}</dd>
          </div>
        </dl>
        <section className="intelligence-strategy-board__steps">
          {(plan?.steps ?? []).map((step) => {
            const rowValue = rowFor(step.output);
            return (
              <article key={step.stepId} className="intelligence-strategy-board__step">
                <h3>{step.stepId}</h3>
                <p>{step.plugin}</p>
                <p>lane {step.lane}</p>
                <p>inputs {rowFor(step.inputs)}</p>
                <p>output {rowValue}</p>
              </article>
            );
          })}
          {(!plan || plan.steps.length === 0) && <p>No steps loaded</p>}
        </section>
      </section>
    );
  },
);
