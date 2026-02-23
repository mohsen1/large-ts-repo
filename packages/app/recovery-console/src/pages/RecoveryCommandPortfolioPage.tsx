import type { ReactElement } from 'react';
import type { CommandIntent } from '@domain/recovery-command-language';
import { useMemo } from 'react';
import { CommandLanguageWorkbench } from '../components/CommandLanguageWorkbench';
import { useRecoveryCommandOrchestrationStudio } from '../hooks/useRecoveryCommandOrchestrationStudio';
import { InMemoryCommandStore } from '@data/recovery-command-control-plane';

const store = new InMemoryCommandStore();

const seedIntents: CommandIntent[] = [
  {
    id: '5b1d4d5b-12d5-4d7c-bb13-5df1d8a2f2ef',
    label: 'Cross-cluster rebalancing',
    description: 'Rebalance request due to saturation in workload cluster',
    priority: 3,
    confidenceScore: 0.71,
    owner: 'autoscaler',
    payload: { open: true },
    tags: ['scale', 'autoscaling'],
    metadata: {
      sourceService: 'workload-service',
      reasonCode: 'capacity',
      createdAt: new Date().toISOString(),
      requestedBy: 'capacity-bot',
      expectedImpactMins: 45,
    },
  },
  {
    id: 'c5f6fd0f-1d8e-4460-b1d0-1d3a2cb0a2f1',
    label: 'Incident packet replay',
    description: 'Replay failed packets in non-production to validate controls',
    priority: 5,
    confidenceScore: 0.63,
    owner: 'replay-ops',
    payload: { open: true },
    tags: ['incident', 'diagnostic'],
    metadata: {
      sourceService: 'incident-console',
      reasonCode: 'diagnostic',
      createdAt: new Date().toISOString(),
      requestedBy: 'replay-team',
      expectedImpactMins: 20,
    },
  },
];

export function RecoveryCommandPortfolioPage(): ReactElement {
  const [state, submit] = useRecoveryCommandOrchestrationStudio({
    intentSource: async () => seedIntents,
    directiveSource: async () => [],
    store,
  });

  const byOwner = useMemo(() => {
    const map = new Map<string, CommandIntent[]>();
    for (const intent of seedIntents) {
      const list = map.get(intent.owner) ?? [];
      map.set(intent.owner, [...list, intent]);
    }
    return map;
  }, []);

  return (
    <main>
      <h1>Command portfolio</h1>
      <p>Active: {state.snapshot?.commandIntents.length ?? 0}</p>
      <button type="button" onClick={() => void submit()}>
        Run portfolio simulation
      </button>
      <CommandLanguageWorkbench snapshot={state.snapshot} directives={state.snapshot?.activeDirectives ?? []} />
      <section>
        <h2>Owner distribution</h2>
        <ul>
          {Array.from(byOwner.entries()).map(([owner, items]) => (
            <li key={owner}>
              <strong>{owner}</strong>
              <span>{` (${items.length})`}</span>
              <ul>
                {items.map((intent) => (
                  <li key={intent.id}>{intent.label}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <p>{state.lastSummary}</p>
      {state.error ? <p style={{ color: 'red' }}>{state.error}</p> : null}
    </main>
  );
}
