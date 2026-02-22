import { useState } from 'react';
import { withBrand } from '@shared/core';

import { RecoveryOperationsControlPanel } from '../components/RecoveryOperationsControlPanel';
import { RecoverySimulationHistoryPage } from './RecoverySimulationHistoryPage';
import { RecoverySimulationWorkspacePage } from './RecoverySimulationWorkspacePage';
import { useRecoverySimulationWorkspace } from '../hooks/useRecoverySimulationWorkspace';

export const RecoveryOperationsCenterPage = () => {
  const simulation = useRecoverySimulationWorkspace();
  const [view, setView] = useState<'workspace' | 'history'>('workspace');

  const tenant = 'global';
  const metrics = {
    workspaceId: 'ops-center',
    tenant,
    filter: {
      tenant,
      status: ['ok', 'degraded'] as const,
    },
  } as const;

  return (
    <main className="operations-center">
      <nav>
        <button type="button" onClick={() => setView('workspace')}>
          Workspace
        </button>
        <button type="button" onClick={() => setView('history')}>
          History
        </button>
      </nav>
      <section>
        <RecoveryOperationsControlPanel
          running={simulation.busy}
          summary={simulation.selected}
          diagnostics={simulation.diagnostics}
          onRun={() =>
            void simulation.run(
              {
                scenarioId: withBrand('ops-center:scenario', 'RecoveryScenarioId'),
                runId: withBrand('ops-center-run', 'RecoveryRunId'),
                token: withBrand('global:ops-center-run', 'RecoveryWindowToken'),
                activeStepIds: ['ops-start'],
                disabledStepIds: [],
                createdAt: new Date().toISOString(),
              },
              {
                id: withBrand('ops:program', 'RecoveryProgramId'),
                tenant: withBrand('global', 'TenantId'),
                service: withBrand('ops', 'ServiceId'),
                name: 'Operations recovery',
                description: 'manual ops runbook simulation',
                priority: 'platinum',
                mode: 'defensive',
                window: {
                  startsAt: new Date().toISOString(),
                  endsAt: new Date(Date.now() + 3600_000).toISOString(),
                  timezone: 'UTC',
                },
                topology: {
                  rootServices: ['edge'],
                  fallbackServices: ['edge-fallback'],
                  immutableDependencies: [['edge', 'db']],
                },
                constraints: [],
                steps: [],
                owner: 'operator',
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            )
          }
          onReset={simulation.clear}
        />
        {view === 'workspace' ? (
          <RecoverySimulationWorkspacePage {...metrics} />
        ) : (
          <RecoverySimulationHistoryPage tenant={tenant} defaultFilter={metrics.filter} />
        )}
      </section>
    </main>
  );
};
