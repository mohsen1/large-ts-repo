import { useMemo } from 'react';

import type {
  FabricAllocation,
  FabricCandidate,
  FabricScenario,
  FabricWindow,
} from '@domain/recovery-fabric-models';

interface RecoveryFabricControlDeckProps {
  readonly scenario: FabricScenario;
  readonly allocation: FabricAllocation;
  readonly candidates: readonly FabricCandidate[];
  readonly selectedCandidateId: FabricCandidate['id'];
  readonly setSelectedCandidateId: (candidateId: FabricCandidate['id']) => void;
  readonly onRun: () => void;
  readonly onDryRun: () => void;
  readonly isBusy: boolean;
  readonly window: FabricWindow;
}

const candidateScore = (candidate: FabricCandidate, scenario: FabricScenario): number => {
  const routeWeight = candidate.routeIds.length;
  const nodeWeight = candidate.planNodeIds.length;
  const availability = scenario.window.blackoutAt?.length ?? 0;
  return Number((100 - routeWeight * 4 - nodeWeight * 3 - availability).toFixed(1));
};

const normalizePlanName = (candidate: FabricCandidate, index: number) => candidate.rationale || `candidate-${index + 1}`;

const estimateCoverage = (window: FabricWindow): string => {
  const started = new Date(window.startedAt).getTime();
  const ended = new Date(window.endsAt).getTime();
  const minutes = Math.max(1, Math.floor((ended - started) / 60000));
  const blocks = window.blackoutAt?.length ?? 0;
  const effective = Math.max(0, 100 - blocks * 2);
  return `${effective}% over ${minutes}m`;
};

export const RecoveryFabricControlDeck = ({
  scenario,
  allocation,
  candidates,
  selectedCandidateId,
  setSelectedCandidateId,
  onRun,
  onDryRun,
  isBusy,
  window,
}: RecoveryFabricControlDeckProps) => {
  const cards = useMemo(
    () =>
      candidates.map((candidate) => ({
        id: candidate.id,
        label: normalizePlanName(candidate, candidates.indexOf(candidate)),
        score: candidateScore(candidate, scenario),
      })),
    [candidates, scenario],
  );

  return (
    <section>
      <h2>Fabric control deck</h2>
      <p>{`Nodes selected: ${allocation.allocatedNodeIds.length}`}</p>
      <p>{`Window coverage: ${estimateCoverage(window)}`}</p>
      <p>{`Canary order: ${allocation.canaryOrder.join(' → ')}`}</p>
      <div>
        {cards.map((card) => (
          <article
            key={card.id}
            style={{
              border: card.id === selectedCandidateId ? '2px solid #00aaff' : '1px solid #666',
              margin: '0.5rem 0',
              padding: '0.75rem',
            }}
          >
            <header>
              <strong>{card.label}</strong>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setSelectedCandidateId(card.id)}
                style={{ marginLeft: '0.75rem' }}
              >
                {card.id === selectedCandidateId ? 'active' : 'select'}
              </button>
            </header>
            <p>{`priority score: ${card.score}`}</p>
          </article>
        ))}
      </div>
      <div>
        <button type="button" disabled={isBusy} onClick={onRun}>
          execute fabric controller
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onDryRun}
          style={{ marginLeft: '0.75rem' }}
        >
          dry-run
        </button>
      </div>
    </section>
  );
};
