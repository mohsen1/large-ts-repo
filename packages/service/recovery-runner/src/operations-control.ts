import { withBrand } from '@shared/core';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RunSession, RunPlanSnapshot } from '@domain/recovery-operations-models';
import {
  buildCommandSurface,
  summarizeSurface,
} from '@domain/recovery-operations-models/command-surface';
import { buildOrchestrationMatrix, buildReadinessProfile } from '@domain/recovery-operations-models/orchestration-matrix';
import { buildIntentGatewayReport } from '@domain/recovery-operations-models/command-intent-gateway';
import { buildPortfolioReadinessBoard } from '@domain/recovery-operations-models/portfolio-readiness';
import { hydrateWorkspaceBySession } from '@data/recovery-operations-store';

export interface OperationsControlOptions {
  readonly tenant: string;
  readonly candidatePlans: readonly RunPlanSnapshot[];
  readonly limit?: number;
}

export interface OperationsControlSnapshot {
  readonly tenant: string;
  readonly generatedAt: string;
  readonly surfaceCount: number;
  readonly commandSurfaceScore: number;
  readonly readinessBoard: ReturnType<typeof buildPortfolioReadinessBoard>;
  readonly matrixRiskSum: number;
}

export interface OperationsControlResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly message: string;
}

export const buildOperationsWorkspaceSnapshot = async (
  repository: RecoveryOperationsRepository,
  sessionId: string,
  options: OperationsControlOptions,
): Promise<Result<OperationsControlSnapshot, Error>> => {
  const session = await repository.loadSessionByRunId(sessionId);
  if (!session) {
    return fail(new Error(`session-not-found:${sessionId}`));
  }

  const plans = options.candidatePlans.slice(0, options.limit ?? options.candidatePlans.length);
  const workspace = hydrateWorkspaceBySession(session, plans);

  const surfaces = plans.map((plan) => buildCommandSurface(session, plan));
  const surfaceSummary = surfaces.reduce((acc, surface) => {
    const summary = summarizeSurface(surface);
    return acc + summary.average;
  }, 0);
  const commandSurfaceScore = surfaces.length ? Number((surfaceSummary / surfaces.length).toFixed(4)) : 0;

  const matrices = plans.map((plan) => buildOrchestrationMatrix(session, plan));
  const matrixRiskSum = matrices.reduce((acc, matrix) => acc + matrix.cycleRisk, 0);

  const readinessProfiles = plans.map((plan) => buildReadinessProfile(session, plan));
  const surfacesForBoard = plans.map((plan) => buildCommandSurface(session, plan));
  const readinessBoard = buildPortfolioReadinessBoard(options.tenant, session, plans, readinessProfiles, surfacesForBoard);

  return ok({
    tenant: options.tenant,
    generatedAt: new Date().toISOString(),
    surfaceCount: workspace.plans.length,
    commandSurfaceScore,
    readinessBoard,
    matrixRiskSum,
  });
};

export const runAbortProcedure = async (
  repository: RecoveryOperationsRepository,
  sessionId: string,
  ticketId: string,
  reason: string,
): Promise<Result<OperationsControlResult, Error>> => {
  const session = await repository.loadSessionByRunId(sessionId);
  if (!session) {
    return fail(new Error('session-not-found'));
  }

  const next: RunSession = {
    ...session,
    status: 'aborted',
    updatedAt: new Date().toISOString(),
  };

  await repository.upsertSession(next);
  await repository.upsertDecision({
    runId: next.runId,
    ticketId,
    accepted: false,
    reasonCodes: ['manual-abort', reason],
    score: 0,
    createdAt: new Date().toISOString(),
  });

  return ok({
    ok: true,
    message: `aborted session ${next.runId} for ${reason}`,
  });
};

export const buildIntentGatewaySnapshots = async (
  repository: RecoveryOperationsRepository,
  sessionId: string,
  tenant: string,
): Promise<Result<readonly ReturnType<typeof buildIntentGatewayReport>[], Error>> => {
  const session = await repository.loadSessionByRunId(sessionId);
  if (!session) {
    return fail(new Error(`session-not-found:${sessionId}`));
  }

  const latest = await repository.loadLatestSnapshot(tenant);
  const plans = latest?.planId
    ? [
        {
          id: withBrand(latest.planId, 'RunPlanId'),
          name: 'latest-plan',
          program: (session as never) as any,
          constraints: session.constraints,
          fingerprint: {
            tenant: withBrand(tenant, 'TenantId'),
            region: 'global',
            serviceFamily: 'recovery',
            impactClass: 'infrastructure',
            estimatedRecoveryMinutes: 30,
          },
          effectiveAt: new Date().toISOString(),
        } as unknown as RunPlanSnapshot,
      ]
    : [];

  const snapshots = plans.map((plan) => {
    const surface = buildCommandSurface(session, plan);
    const matrix = buildOrchestrationMatrix(session, plan);
    return buildIntentGatewayReport(tenant, session, surface, matrix);
  });

  return ok(snapshots);
};
