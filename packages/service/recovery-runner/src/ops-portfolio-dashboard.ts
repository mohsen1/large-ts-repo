import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RunSession } from '@domain/recovery-operations-models';
import type { RecoveryConstraintBudget, RunPlanSnapshot } from '@domain/recovery-operations-models';
import { buildOrchestrationMatrix, buildReadinessProfile } from '@domain/recovery-operations-models/orchestration-matrix';
import { buildCommandSurface } from '@domain/recovery-operations-models/command-surface';
import { buildIntentGatewayReport } from '@domain/recovery-operations-models/command-intent-gateway';
import { buildCommandHubMetrics } from '@data/recovery-operations-store';

export interface PortfolioSnapshot {
  readonly tenant: string;
  readonly session: RunSession;
  readonly plan: RunPlanSnapshot;
  readonly readiness: ReturnType<typeof buildReadinessProfile>;
  readonly gatewayConfidence: number;
  readonly recommendation: string;
}

export interface PortfolioState {
  readonly tenant: string;
  readonly generatedAt: string;
  readonly snapshots: readonly PortfolioSnapshot[];
  readonly controlScore: number;
}

const buildPlanFromSession = (tenant: string, session: RunSession): RunPlanSnapshot => ({
  id: session.planId,
  name: 'latest-plan',
  program: (session as { readonly constraints: RecoveryConstraintBudget } & { readonly planId: string }) as unknown as RunPlanSnapshot['program'],
  constraints: session.constraints,
  fingerprint: {
    tenant: withTenant(tenant),
    region: 'global',
    serviceFamily: 'operations',
    impactClass: 'infrastructure',
    estimatedRecoveryMinutes: 30,
  },
  effectiveAt: new Date().toISOString(),
});

const withTenant = (tenant: string) => {
  return (tenant.endsWith(':') ? tenant : tenant) as RunPlanSnapshot['fingerprint']['tenant'];
};

export const buildPortfolioState = async (
  repository: RecoveryOperationsRepository,
  tenant: string,
): Promise<Result<PortfolioState, Error>> => {
  const snapshot = await repository.loadLatestSnapshot(tenant);
  if (!snapshot || !snapshot.planId) {
    return fail(new Error(`portfolio-missing:${tenant}`));
  }

  const session: RunSession | undefined = snapshot.sessions[0]
    ? {
        ...snapshot.sessions[0],
        runId: snapshot.sessions[0].runId,
      }
    : undefined;

  if (!session) {
    return fail(new Error('session-missing'));
  }

  const plans: readonly RunPlanSnapshot[] = [buildPlanFromSession(tenant, session)];

  const snapshots = plans.map((plan) => {
    const readiness = buildReadinessProfile(session, plan);
    const surface = buildCommandSurface(session, plan);
    const matrix = buildOrchestrationMatrix(session, plan);
    const gateway = buildIntentGatewayReport(tenant, session, surface, matrix);

    return {
      tenant,
      session,
      plan,
      readiness,
      gatewayConfidence: gateway.confidence,
      recommendation: gateway.routes.length > 1 ? 'stagger' : 'continue',
    };
  });

  const metrics = await buildCommandHubMetrics(repository, tenant);
  const controlScore = snapshots.length
    ? metrics.summary.commandSurfaceScore
    : 0;

  return ok({
    tenant,
    generatedAt: new Date().toISOString(),
    snapshots,
    controlScore,
  });
};

export const summarizePortfolioState = (state: PortfolioState): string => {
  const active = state.snapshots.length;
  const totalReadiness = state.snapshots.reduce((acc, snapshot) => acc + snapshot.readiness.completionScore, 0);
  const avgReadiness = active ? totalReadiness / active : 0;

  if (state.controlScore < 0.4) {
    return `tenant=${state.tenant} control=${state.controlScore.toFixed(2)} readiness=${avgReadiness.toFixed(2)} actions=freeze`;
  }

  if (state.controlScore < 0.7) {
    return `tenant=${state.tenant} control=${state.controlScore.toFixed(2)} readiness=${avgReadiness.toFixed(2)} actions=monitor`;
  }

  return `tenant=${state.tenant} control=${state.controlScore.toFixed(2)} readiness=${avgReadiness.toFixed(2)} actions=proceed`;
};

const withBrand = (value: string): string => `${value}`;
