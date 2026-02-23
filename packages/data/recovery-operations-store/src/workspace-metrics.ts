import { ok, type Result } from '@shared/result';
import { createEnvelope, type JsonObject } from '@shared/observability-contracts';
import type { ReadinessProfile, RunSession } from '@domain/recovery-operations-models';
import type { StoreSnapshot } from './models';
import {
  hydrateWorkspaceBySession,
  inspectWorkspaceHealth,
  inspectWorkspaceGateways,
  type WorkspaceEnvelope,
} from './operations-workspace';
import type { RunPlanSnapshot } from '@domain/recovery-operations-models';

export interface WorkspaceMetrics {
  readonly runId: string;
  readonly tenant: string;
  readonly signalCount: number;
  readonly planCount: number;
  readonly gateScore: number;
  readonly decisionCount: number;
  readonly riskTag: string;
}

export interface WorkspaceAuditEnvelope {
  readonly tenant: string;
  readonly runId: string;
  readonly source: string;
  readonly summary: string;
  readonly observedAt: string;
}

export interface WorkspaceEvent {
  readonly tenant: string;
  readonly runId: string;
  readonly kind: 'snapshot' | 'decision' | 'plan';
  readonly payload: JsonObject;
  readonly observedAt: string;
  readonly envelope: string;
}

export const hydrateWorkspace = (session: RunSession, plans: readonly RunPlanSnapshot[]): WorkspaceEnvelope => {
  return hydrateWorkspaceBySession(session, plans);
};

export const collectWorkspaceMetrics = (workspace: WorkspaceEnvelope): WorkspaceMetrics => {
  const health = inspectWorkspaceHealth(workspace);
  return {
    runId: workspace.session.runId,
    tenant: workspace.tenant,
    signalCount: workspace.session.signals.length,
    planCount: workspace.plans.length,
    gateScore: Number((health.matrixRiskScore + health.commandSurfaceScore + health.signalCoverage) / 3),
    decisionCount: 0,
    riskTag: health.boardTopRecommendation,
  };
};

export const collectGatewaySignatures = (workspace: WorkspaceEnvelope): readonly string[] => {
  return inspectWorkspaceGateways(workspace).map((gateway, index) => {
    const routeCount = gateway.routes.length;
    const activeCount = gateway.states.length;
    return `${index}:${routeCount}:${activeCount}:${gateway.confidence.toFixed(2)}`;
  });
};

export const buildWorkspaceAudit = (
  workspace: WorkspaceEnvelope,
  readinessProfile: ReadinessProfile,
): WorkspaceAuditEnvelope => {
  return {
    tenant: workspace.tenant,
    runId: String(workspace.session.runId),
    source: 'workspace-metrics',
    summary: [
      `gatewayCount=${collectGatewaySignatures(workspace).length}`,
      `planCount=${workspace.plans.length}`,
      `signalCount=${workspace.session.signals.length}`,
      `readinessWindow=${readinessProfile.windowMinutes}`,
      `risk=${readinessProfile.worstProjection}`,
      `run=${readinessProfile.snapshots.length}`,
    ].join(' | '),
    observedAt: new Date().toISOString(),
  };
};

export const buildWorkspaceSummaryFromPlan = (audit: WorkspaceAuditEnvelope, owner: string): string => {
  return `${owner}:${audit.source}:${audit.summary}`;
};

export const emitWorkspaceEvent = (
  workspace: WorkspaceEnvelope,
  kind: WorkspaceEvent['kind'],
  payload: JsonObject,
): WorkspaceEvent => {
  const eventEnvelope = createEnvelope<JsonObject, { operation: string; actor?: string; confidence?: number }>(
    workspace.tenant,
    'recovery-operations-store',
    kind,
    payload,
    {
      operation: `workspace-${kind}`,
      actor: workspace.plans[0]?.name ?? 'store',
      confidence: 0.83,
    },
  );

  const event: WorkspaceEvent = {
    tenant: workspace.tenant,
    runId: String(workspace.session.runId),
    kind,
    payload,
    observedAt: new Date().toISOString(),
    envelope: JSON.stringify(eventEnvelope),
  };

  return event;
};

export const buildWorkspaceEnvelopeFromSnapshot = (
  tenant: string,
  snapshot: StoreSnapshot,
): Result<WorkspaceAuditEnvelope, string> => {
  if (!snapshot.latestDecision) {
    return { ok: false, error: 'missing-latest-decision' };
  }

  return ok({
    tenant,
    runId: snapshot.planId,
    source: 'workspace-from-snapshot',
    summary: `plan=${snapshot.planId} sessions=${snapshot.sessions.length}`,
    observedAt: new Date().toISOString(),
  });
};
