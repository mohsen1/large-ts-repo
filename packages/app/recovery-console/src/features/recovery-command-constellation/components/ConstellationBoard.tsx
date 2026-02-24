import { useMemo } from 'react';

import type { ConstellationHookState, ConstellationPlanCardProps } from '../types';

interface ConstellationBoardProps {
  readonly state: ConstellationHookState;
  readonly plans: ReadonlyArray<ConstellationPlanCardProps>;
  readonly onOpen: (planId: string) => void;
}

export const ConstellationBoard = ({ state, plans, onOpen }: ConstellationBoardProps) => {
  const planCards = useMemo(() => plans, [plans]);
  return (
    <section className="recovery-command-constellation-board">
      <h2>Constellation Plans</h2>
      {state.loading ? <p>Running constellation orchestration...</p> : null}
      {state.errorMessage ? <p>{state.errorMessage}</p> : null}
      <ul>
        {planCards.map((planCard) => (
          <li key={planCard.plan.id}>
            <article>
              <h3>{planCard.plan.title}</h3>
              <p>{planCard.plan.phase}</p>
              <p>{planCard.plan.stages.length} stages</p>
              <button type="button" onClick={() => planCard.onSelect(planCard.plan.id)}>
                Open
              </button>
              <button type="button" onClick={() => onOpen(planCard.plan.id)}>
                Focus
              </button>
            </article>
          </li>
        ))}
      </ul>
      <footer>
        <p>Run count: {state.trace.length}</p>
      </footer>
    </section>
  );
};
