import { useMemo } from 'react';

import { CommandStudioPlanTable } from '../components/command-studio/CommandStudioPlanTable';
import { CommandStudioReadinessPanel } from '../components/command-studio/CommandStudioReadinessPanel';
import { CommandStudioTimeline } from '../components/command-studio/CommandStudioTimeline';
import { useRecoveryCommandStudio } from '../hooks/useRecoveryCommandStudio';
import { summarizeSequence } from '../services/commandStudioAdapter';

const baseRows = [
  {
    sequenceId: 'init.sequence.alpha',
    state: 'queued' as const,
    estimatedMinutes: 12,
    warningCount: 1,
  },
  {
    sequenceId: 'init.sequence.beta',
    state: 'complete' as const,
    estimatedMinutes: 8,
    warningCount: 0,
  },
];

const defaultSeedState = {
  sequences: [],
  runs: [],
  simulations: [],
  metrics: [],
};

export const RecoveryCommandStudioPage = () => {
  const state = useRecoveryCommandStudio({
    workspaceId: 'tenant-studio-main',
    seedState: defaultSeedState,
  });

  const summary = useMemo(
    () =>
      summarizeSequence(
        'tenant-studio-main',
        {
          sequences: [],
          runs: [],
          simulations: [],
          metrics: [],
        },
        [],
      ),
    [],
  );

  const timelinePoints = useMemo(
    () =>
      state.timeline.map((entry) => ({
        at: entry.expectedStart,
        commandId: entry.commandId,
        blockerCount: entry.blockers.length,
        metricCount: entry.metrics.length,
      })),
    [state.timeline],
  );

  const rows = state.boardRows.length ? state.boardRows : baseRows;

  return (
    <main className="recovery-command-studio-page">
      <header>
        <h1>Recovery Command Studio</h1>
        <p>{`Workspace ${state.workspaceId} · lane utilization ${(state.laneUtilization * 100).toFixed(1)}%`}</p>
        <p>{state.lastError ? `Warning: ${state.lastError}` : 'Ready'}</p>
      </header>
      <section>
        <CommandStudioPlanTable rows={rows} />
      </section>
      <section>
        <CommandStudioReadinessPanel summary={summary} />
      </section>
      <section>
        <CommandStudioTimeline points={timelinePoints} />
      </section>
    </main>
  );
};
