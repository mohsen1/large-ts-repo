import { withBrand } from '@shared/core';
import { fail, ok, type Result } from '@shared/result';
import { createEnvelope, type TimedEnvelope } from '@shared/observability-contracts';
import { buildReadinessSnapshot } from '@domain/recovery-operations-models';
import { buildReadinessProfile } from '@domain/recovery-operations-models/operations-readiness';
import { buildIntentBand, scoreIntentEnvelope, type IntentEnvelope } from '@domain/recovery-operations-models/command-intent-band';
import { parseSignalEnvelope, routeSignals } from '@data/recovery-operations-store/signal-router';
import {
  hydrateWorkspaceBySession,
  inspectWorkspaceHealth,
  inspectWorkspaceGateways,
} from '@data/recovery-operations-store/operations-workspace';
import { buildWorkspaceEnvelopeFromSnapshot, buildWorkspaceSummaryFromPlan } from '@data/recovery-operations-store/workspace-metrics';
import type {
  RecoveryOperationsEnvelope,
  RecoverySignal,
  ReadinessProfile,
  RunPlanSnapshot,
  RunSession,
} from '@domain/recovery-operations-models';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';

export interface WorkspaceOperatorConfig {
  readonly tenant: string;
  readonly runId: string;
  readonly enforceFilters: boolean;
}

export interface WorkspaceOperatorResult {
  readonly tenant: string;
  readonly runId: string;
  readonly profile: ReadinessProfile;
  readonly routeCounts: Record<string, number>;
  readonly score: number;
  readonly eventEnvelope: TimedEnvelope<{ tenant: string; runId: string; intentScore: number; gatewayCount: number }>;
  readonly summary: string;
}

const parseSignals = (
  payloads: readonly RecoveryOperationsEnvelope<RecoverySignal>[],
): readonly RecoverySignal[] =>
  payloads
    .map((payload) => {
      const parsed = parseSignalEnvelope(payload);
      return parsed.ok ? parsed.value : undefined;
    })
    .filter((entry): entry is RecoverySignal => Boolean(entry));

const routeCounts = (routed: ReturnType<typeof routeSignals>['routed']): Record<string, number> => {
  const counts: Record<string, number> = {
    critical: 0,
    prioritize: 0,
    routine: 0,
    noise: 0,
    escalation: 0,
  };

  for (const item of routed) {
    counts[item.route] = (counts[item.route] ?? 0) + 1;
  }

  return counts;
};

const buildWorkspaceIntent = (
  tenant: string,
  session: RunSession,
  plan: RunPlanSnapshot,
  readinessPlan: RecoveryReadinessPlan,
): IntentEnvelope => {
  return {
    ...buildIntentBand(tenant, session, plan, readinessPlan),
    matrix: [
      {
        band: `score-${tenant}`,
        confidence: readinessPlan.signals.length / 100,
        vector: 'risk',
        phase: 'capture',
        selected: true,
      },
      ...[],
    ],
    createdAt: new Date().toISOString(),
    generatedBy: 'workspace-operator',
    id: `${tenant}:${Date.now()}`,
  };
};

export const runWorkspaceOperator = async (
  config: WorkspaceOperatorConfig,
  repository: RecoveryOperationsRepository,
  session: RunSession,
  plan: RunPlanSnapshot,
  readinessPlan: RecoveryReadinessPlan,
  rawSignals: readonly RecoveryOperationsEnvelope<RecoverySignal>[],
): Promise<Result<WorkspaceOperatorResult, string>> => {
  const parsedSignals = parseSignals(rawSignals);
  const routing = routeSignals(config.tenant, session, rawSignals);

  const usedSignals = config.enforceFilters ? routing.routed.map((entry) => entry.signal) : parsedSignals;
  if (!usedSignals.length) {
    return fail('no-valid-signals');
  }

  const snapshot = buildReadinessSnapshot(config.tenant, session, plan, readinessPlan);
  const profile = buildReadinessProfile(config.tenant, {
    tenant: config.tenant,
    key: withBrand(`${config.runId}:profile`, 'ReadinessEnvelopeKey'),
    snapshots: [snapshot, ...rawSignals.map(() => ({
      tenant: config.tenant,
      runId: String(session.runId),
      planId: String(plan.id),
      score: snapshot.score,
      pressure: snapshot.pressure,
      projection: snapshot.projection,
      recommendation: snapshot.recommendation,
      generatedAt: new Date().toISOString(),
    } as const))],
    trend: usedSignals.length,
    summary: `run=${config.runId} signals=${usedSignals.length}`,
  });

  const workspace = hydrateWorkspaceBySession(session, [plan]);
  const health = inspectWorkspaceHealth(workspace);
  const gateways = inspectWorkspaceGateways(workspace);

  await repository.upsertSession(session);
  await repository.upsertPlan(plan);

  const intent = buildWorkspaceIntent(config.tenant, session, plan, readinessPlan);
  const intentScore = scoreIntentEnvelope(intent);
  const count = routeCounts(routing.routed);

  const eventEnvelope = createEnvelope<{ tenant: string; runId: string; intentScore: number; gatewayCount: number }, { operation: string; actor?: string; confidence?: number }>(
    config.tenant,
    'recovery-operations-engine',
    'workspace-operate',
    {
      tenant: config.tenant,
      runId: config.runId,
      intentScore,
      gatewayCount: gateways.length,
    },
    {
      operation: 'workspace-operate',
      actor: 'workspace-operator',
      confidence: 0.95,
    },
  );

  const workspaceSnapshot = buildWorkspaceEnvelopeFromSnapshot(config.tenant, {
    tenant: config.tenant,
    planId: String(plan.id),
    sessions: [
      {
        ...session,
        tenant: withBrand(config.tenant, 'TenantId'),
        updatedAt: new Date().toISOString(),
      },
    ],
    latestDecision: undefined,
  });

  if (!workspaceSnapshot.ok) {
    return fail('workspace-summary-failed');
  }

  return ok({
    tenant: config.tenant,
    runId: config.runId,
    profile,
    routeCounts: count,
    score: Number(((health.matrixRiskScore + intentScore + health.commandSurfaceScore) / 3).toFixed(4)),
    eventEnvelope,
    summary: `${profile.windowMinutes}m | ${buildWorkspaceSummaryFromPlan(workspaceSnapshot.value, readinessPlan.metadata.owner)}`,
  });
};

export const inspectWorkspaceOperator = (
  result: WorkspaceOperatorResult,
  plan: ReadinessProfile,
): readonly string[] => {
  const riskLines = [
    `tenant=${result.tenant}`,
    `run=${result.runId}`,
    `score=${result.score.toFixed(4)}`,
    `planSignals=${plan.snapshots.length}`,
    ...Object.entries(result.routeCounts).map(([route, count]) => `${route}:${count}`),
  ];

  return riskLines;
};
