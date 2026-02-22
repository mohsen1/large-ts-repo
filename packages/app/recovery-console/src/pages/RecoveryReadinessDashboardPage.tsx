import { useMemo } from 'react';
import { withBrand } from '@shared/core';
import { ReadinessSignalMatrix } from '../components/ReadinessSignalMatrix';
import { useRecoveryOpsWorkspace } from '../hooks/useRecoveryOpsWorkspace';
import type { RecoveryMode, RecoveryPriority } from '@domain/recovery-orchestration';
import type { IncidentClass, RecoverySignal } from '@domain/recovery-operations-models';

export const RecoveryReadinessDashboardPage = () => {
  const tenant = 'global';
  const sessions = useMemo<readonly RecoverySignal[]>(() => [
    {
      id: `${tenant}:probe-a`,
      source: 'probe-a',
      severity: 8,
      confidence: 0.82,
      detectedAt: new Date().toISOString(),
      details: {},
    },
    {
      id: `${tenant}:probe-b`,
      source: 'probe-b',
      severity: 4,
      confidence: 0.61,
      detectedAt: new Date().toISOString(),
      details: {},
    },
  ], []);

  const plan = useMemo(() => ({
    id: withBrand(`${tenant}:readiness-plan`, 'RunPlanId'),
    name: 'readiness-plan',
    program: {
      id: withBrand(`${tenant}:readiness-program`, 'RecoveryProgramId'),
      tenant: withBrand(tenant, 'TenantId'),
      service: withBrand('svc', 'ServiceId'),
      name: 'readiness program',
      description: 'readiness policy',
      priority: 'silver' as RecoveryPriority,
      mode: 'defensive' as RecoveryMode,
      window: {
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        timezone: 'UTC',
      },
      topology: {
        rootServices: ['gateway'],
        fallbackServices: ['gateway-fallback'],
        immutableDependencies: [['gateway', 'cache']] as [string, string][],
      },
      constraints: [],
      steps: [],
      owner: 'operator',
      tags: ['readiness'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    constraints: {
      maxParallelism: 3,
      maxRetries: 2,
      timeoutMinutes: 25,
      operatorApprovalRequired: false,
    },
    fingerprint: {
      tenant: withBrand(tenant, 'TenantId'),
      region: 'global',
      serviceFamily: 'readiness',
      impactClass: 'application' as IncidentClass,
      estimatedRecoveryMinutes: 10,
    },
    effectiveAt: new Date().toISOString(),
  }), [tenant]);

  const workspace = useRecoveryOpsWorkspace({
    tenant,
    signals: sessions,
    plans: [plan],
  });

  return (
    <main>
      <h2>Readiness dashboard</h2>
      <p>{workspace.recommendation}</p>
      <ReadinessSignalMatrix
        sessionId={workspace.workspaceId}
        plans={[plan]}
        signals={sessions}
      />
    </main>
  );
};
