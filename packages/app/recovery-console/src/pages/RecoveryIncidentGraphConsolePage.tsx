import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import type { IncidentGraph, ReadinessSignal } from '@domain/recovery-incident-graph';
import { createPlan, planToGraphText, mutateOrdering, validateInstructions, validateGraph } from '@domain/recovery-incident-graph';
import { RecoveryIncidentGraphCriticalPath } from '../components/RecoveryIncidentGraphCriticalPath';
import { RecoveryIncidentGraphDashboard } from '../components/RecoveryIncidentGraphDashboard';

interface IncidentIncidentGraphConsolePageProps {
  readonly graph: IncidentGraph;
}

const defaultSignals: readonly ReadinessSignal[] = [
  {
    id: 'sig-0' as ReadinessSignal['id'],
    targetNodeId: 'node-0' as ReadinessSignal['targetNodeId'],
    value: 0.6,
    reason: 'manual',
    createdAt: new Date().toISOString(),
    createdBy: 'ui',
  },
];

export const RecoveryIncidentGraphConsolePage = ({ graph }: IncidentIncidentGraphConsolePageProps): ReactElement => {
  const [ordering, setOrdering] = useState<'fifo' | 'alpha' | 'reverse-alpha'>('fifo');
  const [showSignals, setShowSignals] = useState(true);

  const draftSignals = useMemo(() => {
    if (!showSignals) {
      return [] as const;
    }
    return defaultSignals;
  }, [showSignals]);

  const plan = useMemo(() => createPlan(graph, {}), [graph]);
  const order = useMemo(() => mutateOrdering(plan, ordering), [ordering, plan]);
  const planText = useMemo(() => planToGraphText(order), [order]);
  const graphValidation = useMemo(() => validateGraph(graph), [graph]);
  const instructionValidation = useMemo(() => validateInstructions(graph, order.plan.instructions), [graph, order]);

  return (
    <article>
      <header>
        <h1>Incident Graph Console</h1>
        <p>{graph.meta.name}</p>
      </header>
      <section>
        <label>
          Order mode
          <select value={ordering} onChange={(event) => setOrdering(event.target.value as 'fifo' | 'alpha' | 'reverse-alpha')}>
            <option value="fifo">FIFO</option>
            <option value="alpha">Alphabetical</option>
            <option value="reverse-alpha">Reverse Alpha</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={showSignals} onChange={(event) => setShowSignals(event.target.checked)} />
          Include signals
        </label>
      </section>
      <RecoveryIncidentGraphDashboard graph={graph} />
      <RecoveryIncidentGraphCriticalPath graph={graph} />
      <section>
        <h3>Signals</h3>
        <pre>{showSignals ? JSON.stringify(draftSignals, null, 2) : 'signals hidden'}</pre>
      </section>
      <section>
        <h3>Plan</h3>
        <pre>{planText}</pre>
        <h4>Validation</h4>
        <ul>
          <li>graph-valid={String(graphValidation.valid)}</li>
          <li>instruction-valid={String(instructionValidation.valid)}</li>
          <li>issue-count={graphValidation.issues.length + instructionValidation.issues.length}</li>
        </ul>
      </section>
    </article>
  );
};
