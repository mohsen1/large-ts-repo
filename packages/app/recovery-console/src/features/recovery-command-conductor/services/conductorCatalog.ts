import {
  createRunbookId,
  createSignalId,
  createStepId,
  createTenantId,
  type TenantId,
  type RecoverySignal,
  type CommandRunbook,
} from '@domain/recovery-stress-lab';
import { resolveMetricKey, type ConductorRunbook, type ConductorSignalMatrixCell, type ConductorWorkspaceCatalog } from '../types';

const initialSignals = (tenantId: TenantId): readonly RecoverySignal[] => {
  return [
    {
      id: createSignalId(`${tenantId}-availability`),
      class: 'availability',
      severity: 'critical',
      title: 'Availability dip',
      createdAt: '2025-01-01T00:00:00.000Z',
      metadata: { source: 'scheduler', scope: 'zone-a' },
    },
    {
      id: createSignalId(`${tenantId}-integrity`),
      class: 'integrity',
      severity: 'high',
      title: 'Integrity mismatch',
      createdAt: '2025-01-01T00:01:00.000Z',
      metadata: { source: 'ledger-sync', scope: 'zone-b' },
    },
    {
      id: createSignalId(`${tenantId}-performance`),
      class: 'performance',
      severity: 'medium',
      title: 'Latency increase',
      createdAt: '2025-01-01T00:02:00.000Z',
      metadata: { source: 'mesh-router', scope: 'zone-a' },
    },
  ];
};

const initialRunbooks = (tenantId: TenantId): readonly CommandRunbook[] => {
  return [
    {
      id: createRunbookId(`${tenantId}-discover`),
      tenantId,
      name: 'Incident discovery',
      description: 'Discover impacted workloads and map dependencies',
      steps: [
        {
          commandId: createStepId(`${tenantId}-discover-step-1`),
          title: 'Collect telemetry',
          phase: 'observe',
          estimatedMinutes: 6,
          prerequisites: [],
          requiredSignals: [],
        },
        {
          commandId: createStepId(`${tenantId}-discover-step-2`),
          title: 'Build dependency map',
          phase: 'isolate',
          estimatedMinutes: 8,
          prerequisites: [createStepId(`${tenantId}-discover-step-1`)],
          requiredSignals: [createSignalId(`${tenantId}-availability`)],
        },
      ],
      ownerTeam: 'platform',
      cadence: {
        weekday: 1,
        windowStartMinute: 330,
        windowEndMinute: 570,
      },
    },
    {
      id: createRunbookId(`${tenantId}-actuate`),
      tenantId,
      name: 'Actuation and verify',
      description: 'Containment and verification phase',
      steps: [
        {
          commandId: createStepId(`${tenantId}-actuate-step-1`),
          title: 'Apply mitigation',
          phase: 'migrate',
          estimatedMinutes: 15,
          prerequisites: [createStepId(`${tenantId}-discover-step-2`)],
          requiredSignals: [createSignalId(`${tenantId}-integrity`)],
        },
        {
          commandId: createStepId(`${tenantId}-actuate-step-2`),
          title: 'Restore blast radius',
          phase: 'restore',
          estimatedMinutes: 25,
          prerequisites: [createStepId(`${tenantId}-actuate-step-1`)],
          requiredSignals: [createSignalId(`${tenantId}-availability`)],
        },
      ],
      ownerTeam: 'ops',
      cadence: {
        weekday: 1,
        windowStartMinute: 345,
        windowEndMinute: 720,
      },
    },
  ];
};

export const buildConductorWorkspaceCatalog = (tenantId: TenantId): ConductorWorkspaceCatalog => {
  const runbooks = initialRunbooks(tenantId).map((runbook) => ({
    id: runbook.id,
    name: runbook.name,
    commandCount: runbook.steps.length,
    ownerTeam: runbook.ownerTeam,
  }));
  const signals = initialSignals(tenantId).map((signal) => ({
    key: resolveMetricKey(tenantId, signal.id),
    signalId: signal.id,
    severity: signal.severity,
    className: signal.class,
  }));

  return {
    workspace: tenantId,
    runbooks,
    signals,
  };
};

export const buildFallbackCatalog = () => {
  const tenantId = createTenantId('default-tenant');
  return buildConductorWorkspaceCatalog(tenantId);
};
