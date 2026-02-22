import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';
import type { RecoveryOperationsRepository } from './repository';
import { hydrateWorkspaceBySession, inspectWorkspaceGateways, inspectWorkspaceHealth } from './operations-workspace';
import type { RunPlanSnapshot, RunSession, IncidentClass, RecoveryConstraintBudget } from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';

export interface CommandHubMetric {
  readonly planId: string;
  readonly score: number;
  readonly risk: 'green' | 'yellow' | 'red';
}

export interface CommandHubDigest {
  readonly tenant: string;
  readonly generatedAt: string;
  readonly gateways: readonly CommandHubMetric[];
  readonly summary: {
    readonly planCount: number;
    readonly matrixRiskScore: number;
    readonly commandSurfaceScore: number;
  };
}

const classifyRisk = (value: number): CommandHubMetric['risk'] => {
  if (value >= 0.7) return 'green';
  if (value >= 0.4) return 'yellow';
  return 'red';
};

const buildPlanTemplate = (
  tenant: string,
  planId: string,
  program: RecoveryProgram,
  constraints: RecoveryConstraintBudget,
): RunPlanSnapshot => ({
  id: withBrand(planId, 'RunPlanId'),
  name: 'recovered-plan',
  program,
  constraints,
  fingerprint: {
    tenant: withBrand(tenant, 'TenantId'),
    region: 'global',
    serviceFamily: 'recovery',
    impactClass: 'infrastructure' as IncidentClass,
    estimatedRecoveryMinutes: 30,
  },
  effectiveAt: new Date().toISOString(),
});

const buildPlansFromRepository = (snapshotPlanId: string, tenant: string): readonly RunPlanSnapshot[] => {
  const planId = withBrand(snapshotPlanId, 'RunPlanId');
  return [
    buildPlanTemplate(
      tenant,
      planId,
      ({} as unknown) as RecoveryProgram,
      {
        maxParallelism: 1,
        maxRetries: 1,
        timeoutMinutes: 15,
        operatorApprovalRequired: false,
      },
    ),
  ];
};

export const buildCommandHubMetrics = async (
  repository: RecoveryOperationsRepository,
  tenant: string,
): Promise<CommandHubDigest> => {
  const snapshot = await repository.loadLatestSnapshot(tenant);
  const fallbackSession: RunSession = {
    id: withBrand(`fallback-${tenant}`, 'RunSessionId'),
    runId: withBrand(`fallback-run-${tenant}`, 'RecoveryRunId'),
    ticketId: withBrand(`fallback-ticket-${tenant}`, 'RunTicketId'),
    planId: withBrand(`fallback-plan-${tenant}`, 'RunPlanId'),
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    constraints: {
      maxParallelism: 2,
      maxRetries: 2,
      timeoutMinutes: 20,
      operatorApprovalRequired: false,
    },
    signals: [],
  };

  const latestSession = snapshot?.sessions?.[0] ?? fallbackSession;
  const plans = snapshot?.planId
    ? buildPlansFromRepository(snapshot.planId, tenant)
    : [
        buildPlanTemplate(
          tenant,
          `empty-${tenant}`,
          ({} as unknown) as RecoveryProgram,
          {
            maxParallelism: 2,
            maxRetries: 2,
            timeoutMinutes: 10,
            operatorApprovalRequired: false,
          },
        ),
      ];

  const workspace = hydrateWorkspaceBySession(latestSession, plans);
  const health = inspectWorkspaceHealth(workspace);
  const gateways = inspectWorkspaceGateways(workspace);

  const metrics: readonly CommandHubMetric[] = gateways.map((gateway, index) => ({
    planId: String(gateways[index]?.routes?.[0]?.commandId ?? plans[index]?.id ?? tenant),
    score: gateway.confidence,
    risk: classifyRisk(gateway.confidence),
  }));

  return {
    tenant,
    generatedAt: new Date().toISOString(),
    gateways: metrics,
    summary: {
      planCount: health.planCount,
      matrixRiskScore: health.matrixRiskScore,
      commandSurfaceScore: health.commandSurfaceScore,
    },
  };
};

export const buildCommandHubTenantLabel = (tenant: string): Brand<string, 'RecoveryWorkspaceId'> => {
  return withBrand(`${tenant}:hub`, 'RecoveryWorkspaceId');
};
