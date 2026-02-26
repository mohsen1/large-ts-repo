import { useState } from 'react';
import { StressLabDecisionMatrix } from '../components/stress-lab/StressLabDecisionMatrix';
import { StressLabSolverArena } from '../components/stress-lab/StressLabSolverArena';
import { useStressLabArena } from '../hooks/useStressLabArena';
import { compileControlMatrix } from '@domain/recovery-lab-synthetic-orchestration';

const availableDomains = [
  'incident',
  'workload',
  'fabric',
  'chronicle',
  'cockpit',
  'policy',
  'intent',
  'synthesis',
  'operations',
] as const;

const routeCounts = [4, 8, 12, 16, 20] as const;

export const RecoveryStressTypeArenaPage = () => {
  const [domain, setDomain] = useState<(typeof availableDomains)[number]>('incident');
  const [routeCount, setRouteCount] = useState<number>(routeCounts[2]);
  const [selectedCell, setSelectedCell] = useState<string>('');
  const state = useStressLabArena({
    tenant: `tenant-${domain}`,
    domain,
    routeCount,
  });
  const matrixPreview = compileControlMatrix({
    seed: routeCount,
    size: Math.max(10, routeCount),
    mode: 'audit',
  });

  return (
    <main className="recovery-stress-type-arena-page">
      <section>
        <h1>Recovery Stress Type Arena</h1>
        <p>Selected cell: {selectedCell || 'none'}</p>
        <label>
          Domain
          <select
            value={domain}
            onChange={(event) => setDomain(event.target.value as (typeof availableDomains)[number])}
          >
            {availableDomains.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label>
          Route count
          <select
            value={routeCount}
            onChange={(event) => setRouteCount(Number(event.target.value))}
          >
            {routeCounts.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section>
        <StressLabSolverArena state={state} />
      </section>
      <section>
        <StressLabDecisionMatrix
          matrix={{
            ...matrixPreview,
            cells: state.matrix,
            routes: state.routeRoutes as typeof matrixPreview.routes,
            summary: state.matrixSummary,
            warnings: state.matrixWarnings,
          }}
          domain={domain}
          onHighlight={setSelectedCell}
        />
      </section>
      <section>
        <h2>Matrix preview</h2>
        <p>Summary: {matrixPreview.summary}</p>
        <p>Warnings: {matrixPreview.warnings}</p>
      </section>
    </main>
  );
};
