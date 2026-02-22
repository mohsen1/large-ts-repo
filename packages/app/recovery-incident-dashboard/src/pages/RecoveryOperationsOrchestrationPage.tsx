import { useState } from 'react';
import { withBrand } from '@shared/core';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import { OperationsDependencyPanel } from '../components/orchestration/OperationsDependencyPanel';
import { StrategyReadinessPanel } from '../components/orchestration/StrategyReadinessPanel';
import { useRecoveryOperationsOrchestration } from '../hooks/useRecoveryOperationsOrchestration';

interface RecoveryOperationsOrchestrationPageProps {
  readonly tenantId: string;
  readonly operationsRepository: RecoveryOperationsRepository;
  readonly incidentRepository: RecoveryIncidentRepository;
}

export const RecoveryOperationsOrchestrationPage = ({
  tenantId,
  operationsRepository,
  incidentRepository,
}: RecoveryOperationsOrchestrationPageProps) => {
  const { state, refresh, analyzeWindow } = useRecoveryOperationsOrchestration(operationsRepository, tenantId);
  const [windowCount, setWindowCount] = useState(3);

  return (
    <main>
      <header>
        <h1>Recovery Operations Orchestration</h1>
        <p>tenant={tenantId}</p>
        <p>status={state.status}</p>
        <p>summary={state.summary}</p>
      </header>

      <section>
        <button onClick={() => void refresh()}>Refresh board</button>
        <label>
          windows
          <input
            value={windowCount}
            type="number"
            min={1}
            max={10}
            onChange={(event) => setWindowCount(Number(event.target.value))}
          />
        </label>
        <button
          onClick={() =>
            void analyzeWindow(
              Array.from({ length: windowCount }).map((_, index) => ({
                startsAt: new Date(Date.now() + index * 60_000).toISOString(),
                endsAt: new Date(Date.now() + (index + 1) * 60_000).toISOString(),
                timezone: 'UTC',
              })),
            )
          }
        >
          Analyze windows
        </button>
      </section>

      <section>
        <OperationsDependencyPanel
          board={{
            tenant: withBrand(tenantId, 'TenantId'),
            active: state.activePlans.map((runId) => ({
              runId: withBrand(runId, 'RunPlanId'),
              tenant: withBrand(runId, 'TenantId'),
              summary: runId,
              impactBand: 'minimal',
              laneCoverage: 0,
              envelopePriority: 'bronze',
              estimatedMinutes: 1,
            })),
            blocked: [],
            completed: [],
            updatedAt: new Date().toISOString(),
          }}
          tenant={tenantId}
          onRefresh={() => void refresh()}
        />
      </section>

      <section>
        <StrategyReadinessPanel repository={operationsRepository} tenant={tenantId} />
      </section>

      <section>
        <h3>Incident context</h3>
        <p>{incidentRepository ? `incidentRepository: ${typeof incidentRepository}` : 'no incident repo'}</p>
      </section>
    </main>
  );
};
