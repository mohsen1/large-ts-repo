import { useMemo } from 'react';
import type { CommandLabState } from '../../hooks/useCommandLab';

interface CommandLabReadinessPanelProps {
  readonly state: Pick<CommandLabState, 'candidates' | 'order' | 'snapshot' | 'drafts' | 'runs'>;
}

const sample = (item: string, index: number): string => `${index + 1}. ${item}`;

export const CommandLabReadinessPanel = ({ state }: CommandLabReadinessPanelProps) => {
  const candidateList = useMemo(() => state.candidates.map(sample), [state.candidates]);
  const orderList = useMemo(() => state.order.map(sample), [state.order]);
  const catalogs = useMemo(() => {
    return state.runs.flatMap((run) => run.catalog);
  }, [state.runs]);
  const auditCount = state.runs.reduce((acc, run) => acc + run.audits.length, 0);

  return (
    <section className="command-lab-readiness">
      <article>
        <h3>Candidate digest</h3>
        <ul>
          {candidateList.length === 0
            ? <li>No candidates</li>
            : candidateList.map((line, index) => <li key={`candidate-${index}`}>{line}</li>)}
        </ul>
      </article>

      <article>
        <h3>Order digest</h3>
        <ul>
          {orderList.length === 0
            ? <li>No order</li>
            : orderList.map((line, index) => <li key={`order-${index}`}>{line}</li>)}
        </ul>
      </article>

      <article>
        <h3>Snapshots</h3>
        <pre>{state.snapshot.join('\n')}</pre>
      </article>

      <article>
        <h3>Run surface</h3>
        <p>Draft count: {state.drafts.length}</p>
        <p>Run count: {state.runs.length}</p>
        <p>Audit events: {auditCount}</p>
        <p>Catalog refs: {catalogs.length}</p>
      </article>
    </section>
  );
};
