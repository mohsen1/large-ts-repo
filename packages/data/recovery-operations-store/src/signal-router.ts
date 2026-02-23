import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type {
  RecoveryOperationsEnvelope,
  RecoverySignal,
  ReadinessProfile,
  RunSession,
  ReadinessSnapshot,
} from '@domain/recovery-operations-models';
import { buildReadinessProfile } from '@domain/recovery-operations-models/operations-readiness';
import { withBrand } from '@shared/core';
import type { RecoveryOperationsRepository } from './repository';

export type SignalRoute = 'critical' | 'routine' | 'noise' | 'escalation';

export interface RoutedSignal {
  readonly route: SignalRoute;
  readonly signal: RecoverySignal;
  readonly score: number;
  readonly sessionId?: string;
}

export interface RoutingManifest {
  readonly tenant: string;
  readonly runId: string;
  readonly routed: readonly RoutedSignal[];
  readonly rejected: readonly RecoveryOperationsEnvelope<RecoverySignal>[];
}

export const parseSignalEnvelope = (raw: unknown): Result<RecoverySignal, string> => {
  const entry = raw as RecoveryOperationsEnvelope<RecoverySignal>;
  if (!entry?.payload || typeof entry.payload.id !== 'string') {
    return fail('invalid-signal-envelope');
  }

  if (!entry.payload.source || typeof entry.payload.severity !== 'number') {
    return fail('invalid-signal-envelope');
  }

  return ok(entry.payload);
};

const inferRoute = (signal: RecoverySignal): SignalRoute => {
  if (signal.severity >= 9 || signal.source.includes('controller')) return 'escalation';
  if (signal.severity >= 7) return 'critical';
  if (signal.severity >= 4) return 'routine';
  return 'noise';
};

const scoreSignal = (signal: RecoverySignal, session?: RunSession): number => {
  const age = Date.now() - new Date(signal.detectedAt).getTime();
  const agePenalty = Math.max(0, 1 - age / (15 * 60_000));
  const base = signal.confidence * (session?.status === 'blocked' ? 0.5 : 1);
  return Number((base * agePenalty * signal.severity / 10).toFixed(4));
};

export const routeSignals = (
  tenant: string,
  session: RunSession,
  raw: readonly RecoveryOperationsEnvelope<RecoverySignal>[],
): RoutingManifest => {
  const routed: RoutedSignal[] = [];
  const rejected: RecoveryOperationsEnvelope<RecoverySignal>[] = [];

  for (const entry of raw) {
    const parsed = parseSignalEnvelope(entry);
    if (!parsed.ok) {
      rejected.push(entry);
      continue;
    }

    const route = inferRoute(parsed.value);
    const score = scoreSignal(parsed.value, session);
    const accept = score > 0.05 || route !== 'noise';
    if (!accept) {
      rejected.push(entry);
      continue;
    }

    routed.push({
      route,
      signal: parsed.value,
      score,
      sessionId: String(session.id),
    });
  }

  return {
    tenant,
    runId: String(session.runId),
    routed,
    rejected,
  };
};

export const splitByRoute = (routed: readonly RoutedSignal[]): Record<SignalRoute, readonly RoutedSignal[]> => {
  const buckets: Record<SignalRoute, RoutedSignal[]> = {
    critical: [],
    routine: [],
    noise: [],
    escalation: [],
  };

  for (const item of routed) {
    buckets[item.route] = [...buckets[item.route], item];
  }

  return buckets;
};

export const filterHighConfidence = (routed: readonly RoutedSignal[]): readonly RoutedSignal[] =>
  routed.filter((item) => item.score > 0.35);

export const emitDecisionEnvelope = async (
  repository: RecoveryOperationsRepository,
  runId: string,
  signal: RecoveryOperationsEnvelope<RecoverySignal>,
): Promise<void> => {
  await repository.upsertDecision({
    runId,
    ticketId: `${runId}:decision`,
    accepted: signal.payload.confidence > 0.55,
    reasonCodes: [signal.payload.source],
    score: signal.payload.severity,
    createdAt: new Date().toISOString(),
  });
};

const buildReadinessProjection = (snapshotCount: number, routedCount: number): ReadinessProfile => {
  const snapshot: ReadinessSnapshot = {
    tenant: 'global',
    runId: 'run-000',
    planId: withBrand('0', 'RunPlanId'),
    score: snapshotCount ? 0.7 : 0.4,
    pressure: routedCount * 0.08,
    projection: routedCount > snapshotCount ? 'critical' : 'stabilizing',
    recommendation: 'stabilize-and-monitor',
    generatedAt: new Date().toISOString(),
  };

  return buildReadinessProfile('global', {
    tenant: 'global',
    key: withBrand('global:routing:projection', 'ReadinessEnvelopeKey'),
    snapshots: [snapshot],
    trend: snapshotCount + routedCount,
    summary: 'routing-profile',
  });
};

export const buildRoutingSnapshot = (
  tenant: string,
  routed: readonly RoutedSignal[],
  sessionPlanId: string,
): { tenant: string; snapshotId: string; top: string } => {
  const readinessProfile = buildReadinessProjection(routed.length, routed.filter((item) => item.route === 'critical').length);

  return {
    tenant,
    snapshotId: `${tenant}:${readinessProfile.windowMinutes}:${sessionPlanId}`,
    top: `critical=${readinessProfile.snapshots[0]?.recommendation ?? 'none'}:${readinessProfile.worstProjection}`,
  };
};
