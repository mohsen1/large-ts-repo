import { useMemo } from 'react';
import { useRecoveryOpsReadinessBoard } from '../hooks/useRecoveryOpsReadinessBoard';
import { useRecoveryOpsCommandGateway } from '../hooks/useRecoveryOpsCommandGateway';
import type { RunPlanSnapshot } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';

export const RecoveryCommandHubPage = () => {
  const tenant = 'global';
  const board = useRecoveryOpsReadinessBoard(tenant);
  const plan = useMemo<RunPlanSnapshot>(() => ({
    id: withBrand(`${tenant}:hub-plan`, 'RunPlanId'),
    name: 'hub-plan',
    program: {
      id: withBrand(`${tenant}:program`, 'RecoveryProgramId'),
      tenant: withBrand(tenant, 'TenantId'),
      service: withBrand('svc', 'ServiceId'),
      name: 'hub program',
      description: 'hub command plan',
      priority: 'gold',
      mode: 'defensive',
      window: {
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 3600_000).toISOString(),
        timezone: 'UTC',
      },
      topology: {
        rootServices: ['core'],
        fallbackServices: ['core-backup'],
        immutableDependencies: [['core', 'db']],
      },
      constraints: [],
      steps: [],
      owner: 'operator',
      tags: ['command', 'hub'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    constraints: {
      maxParallelism: 2,
      maxRetries: 1,
      timeoutMinutes: 20,
      operatorApprovalRequired: false,
    },
    fingerprint: {
      tenant: withBrand(tenant, 'TenantId'),
      region: 'global',
      serviceFamily: 'command-hub',
      impactClass: 'application',
      estimatedRecoveryMinutes: 15,
    },
    effectiveAt: new Date().toISOString(),
  }), [tenant]);

  const gateway = useRecoveryOpsCommandGateway({
    tenant,
    sessionId: `${tenant}:command-hub-session`,
    plan,
  });

  return (
    <main>
      <h2>Recovery command hub</h2>
      <p>Generated at: {board.generatedAt}</p>
      <ul>
        {board.routes.map((route) => (
          <li key={route.planId}>
            {route.planId}: score={route.score.toFixed(2)} risk={route.risk}
          </li>
        ))}
      </ul>
      <section>
        <h3>Command routes</h3>
        <ul>
          {gateway.rows.map((row) => (
            <li key={row.routeId}>
              {row.commandId} · {row.status} · {row.score.toFixed(2)}
            </li>
          ))}
        </ul>
        <button type="button" onClick={gateway.issue} disabled={!gateway.canIssue}>
          Issue command
        </button>
      </section>
    </main>
  );
};
