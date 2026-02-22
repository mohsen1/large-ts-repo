import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';
import type { RunSession, RunPlanSnapshot } from '@domain/recovery-operations-models';
import type { CommandSurfaceSnapshot } from '@domain/recovery-operations-models/command-surface';
import { buildCommandSurface, summarizeSurface } from '@domain/recovery-operations-models/command-surface';
import { buildOrchestrationMatrix, buildReadinessProfile } from '@domain/recovery-operations-models/orchestration-matrix';
import { buildIntentGatewayReport } from '@domain/recovery-operations-models/command-intent-gateway';
import { buildPortfolioReadinessBoard } from '@domain/recovery-operations-models/portfolio-readiness';
import type { RunSessionRecord } from './models';

export type WorkspaceId = Brand<string, 'RecoveryWorkspaceId'>;

export interface WorkspaceEnvelope {
  readonly workspaceId: WorkspaceId;
  readonly tenant: string;
  readonly createdAt: string;
  readonly session: RunSession;
  readonly plans: readonly RunPlanSnapshot[];
}

export interface WorkspaceInsights {
  readonly workspaceId: WorkspaceId;
  readonly tenant: string;
  readonly generatedAt: string;
  readonly planCount: number;
  readonly commandSurfaceScore: number;
  readonly matrixRiskScore: number;
  readonly boardTopRecommendation: string;
  readonly signalCoverage: number;
}

export const hydrateWorkspaceBySession = (session: RunSession, plans: readonly RunPlanSnapshot[]): WorkspaceEnvelope => ({
  workspaceId: withBrand(`${session.id}:workspace`, 'RecoveryWorkspaceId'),
  tenant: String(session.id).split(':')[0] ?? 'global',
  createdAt: new Date().toISOString(),
  session,
  plans,
});

export const inspectWorkspaceHealth = (workspace: WorkspaceEnvelope): WorkspaceInsights => {
  const surfaces: readonly CommandSurfaceSnapshot[] = workspace.plans.map((plan) => buildCommandSurface(workspace.session, plan));
  const matrices = workspace.plans.map((plan) => buildOrchestrationMatrix(workspace.session, plan));
  const readinessProfiles = workspace.plans.map((plan) => buildReadinessProfile(workspace.session, plan));
  const board = buildPortfolioReadinessBoard(
    workspace.tenant,
    workspace.session,
    workspace.plans,
    readinessProfiles,
    surfaces,
  );

  const matrixRiskScore = matrices.length
    ? matrices.reduce((acc, matrix) => acc + matrix.cycleRisk, 0) / matrices.length
    : 0;

  const commandSurfaceScore = surfaces.length
    ? surfaces.reduce((acc, surface) => acc + summarizeSurface(surface).average, 0) / surfaces.length
    : 0;

  const signalCount = workspace.session.signals.length;
  const coverage = signalCount > 0 ? Math.min(1, workspace.plans.length / signalCount) : 1;

  return {
    workspaceId: workspace.workspaceId,
    tenant: workspace.tenant,
    generatedAt: new Date().toISOString(),
    planCount: workspace.plans.length,
    commandSurfaceScore: Number(commandSurfaceScore.toFixed(4)),
    matrixRiskScore: Number(matrixRiskScore.toFixed(4)),
    boardTopRecommendation: board.topRecommendation,
    signalCoverage: Number(coverage.toFixed(4)),
  };
};

export const inspectWorkspaceGateways = (workspace: WorkspaceEnvelope) => {
  const outputs = workspace.plans.map((plan) => {
    const surface = buildCommandSurface(workspace.session, plan);
    const matrix = buildOrchestrationMatrix(workspace.session, plan);
    return buildIntentGatewayReport(workspace.tenant, workspace.session, surface, matrix);
  });
  return outputs;
};

export const buildWorkspaceDigest = (
  workspace: WorkspaceEnvelope,
  sample: RunSessionRecord,
): Readonly<Record<string, number>> => {
  const digest: Record<string, number> = {};
  const sessions: readonly RunSessionRecord[] = [sample, ...workspace.plans.map((plan) => ({
    ...workspace.session,
    tenant: withBrand(workspace.tenant, 'TenantId'),
    updatedAt: new Date().toISOString(),
    constraints: workspace.session.constraints,
    id: workspace.session.id,
    runId: workspace.session.runId,
    ticketId: workspace.session.ticketId,
    planId: plan.id,
    status: workspace.session.status,
    createdAt: workspace.session.createdAt,
    signals: workspace.session.signals,
  }))];
  for (const item of sessions) {
    for (const signal of item.signals) {
      digest[signal.source] = (digest[signal.source] ?? 0) + 1;
    }
  }
  return digest;
};
