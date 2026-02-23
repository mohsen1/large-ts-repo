import { z } from 'zod';
import { fail, ok, type Result } from '@shared/result';
import { createEnvelope, decodeEnvelope, type TimedEnvelope } from '@shared/observability-contracts';
import { withBrand } from '@shared/core';
import { buildIntentEnvelope, scoreIntentEnvelope, type IntentEnvelope } from '@domain/recovery-operations-models/command-intent-band';
import { buildReadinessHorizon, summarizeHorizonGaps, type HorizonGap, type HorizonSeries } from '@domain/recovery-operations-models/readiness-horizon';
import { buildForecastWindows, buildForecastSeries, type ForecastMatrix, type ForecastSeries, compareForecasts } from '@domain/recovery-operations-models/forecast-matrix';
import { buildReadinessSnapshot } from '@domain/recovery-operations-models';
import { buildReadinessProfile } from '@domain/recovery-operations-models/operations-readiness';
import { routeSignals } from '@data/recovery-operations-store/signal-router';
import {
  hydrateWorkspaceBySession,
  inspectWorkspaceHealth,
  inspectWorkspaceGateways,
} from '@data/recovery-operations-store/operations-workspace';
import { buildWorkspaceSummaryFromPlan } from '@data/recovery-operations-store/workspace-metrics';
import type {
  RecoveryOperationsEnvelope,
  RecoverySignal,
  ReadinessProfile,
  RunPlanSnapshot,
  RunSession,
} from '@domain/recovery-operations-models';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';

export type HorizonResolution = 'minute' | 'hour' | 'day';

export interface CommandHorizonConfig {
  readonly tenant: string;
  readonly runId: string;
  readonly resolution: HorizonResolution;
  readonly maxWindows: number;
}

export interface CommandHorizonPlan {
  readonly tenant: string;
  readonly runId: string;
  readonly profile: ReadinessProfile;
  readonly readinessHorizon: HorizonSeries;
  readonly forecastWindows: ForecastMatrix;
  readonly forecastSeries: ForecastSeries;
  readonly gaps: readonly HorizonGap[];
  readonly intentEnvelope: IntentEnvelope;
  readonly intentScore: number;
  readonly workspaceScore: number;
  readonly eventEnvelope: TimedEnvelope<{ tenant: string; runId: string }>;
}

export interface CommandHorizonStatus {
  readonly tenant: string;
  readonly hasCriticalGap: boolean;
  readonly topSignals: readonly string[];
  readonly gatewayCount: number;
  readonly eventTrace: readonly string[];
}

export const CommandHorizonConfigSchema = z.object({
  tenant: z.string().min(1),
  runId: z.string().min(1),
  resolution: z.enum(['minute', 'hour', 'day']),
  maxWindows: z.number().int().min(1).max(50),
});

export const buildCommandHorizonPlan = (
  config: CommandHorizonConfig,
  session: RunSession,
  plan: RunPlanSnapshot,
  readinessPlan: RecoveryReadinessPlan,
  rawSignals: readonly RecoveryOperationsEnvelope<RecoverySignal>[],
  repository: RecoveryOperationsRepository,
): Result<CommandHorizonPlan, string> => {
  const parse = CommandHorizonConfigSchema.safeParse(config);
  if (!parse.success) {
    return fail('invalid-horizon-config');
  }

  const parsedConfig = parse.data;
  const sessionSignals = routeSignals(parsedConfig.tenant, session, rawSignals).routed.map((entry) => entry.signal);
  const profileSnapshot = buildReadinessSnapshot(parsedConfig.tenant, session, plan, readinessPlan);
  const profile = buildReadinessProfile(parsedConfig.tenant, {
    tenant: parsedConfig.tenant,
    key: withBrand(`${parsedConfig.tenant}:profile:${parsedConfig.runId}`, 'ReadinessEnvelopeKey'),
    snapshots: [profileSnapshot],
    trend: session.signals.length,
    summary: `signals=${sessionSignals.length}`,
  });

  const readinessHorizon = buildReadinessHorizon(
    parsedConfig.tenant,
    parsedConfig.runId,
    [profileSnapshot],
    sessionSignals,
    parsedConfig.resolution,
  );

  const gaps = summarizeHorizonGaps(readinessHorizon);
  const forecastWindows = buildForecastWindows(
    parsedConfig.tenant,
    parsedConfig.runId,
    readinessPlan,
    [profileSnapshot],
    sessionSignals,
  );

  const forecastSeries = buildForecastSeries(
    parsedConfig.tenant,
    parsedConfig.runId,
    profile,
    [profileSnapshot],
    sessionSignals,
  );

  const intentEnvelope = buildIntentEnvelope(parsedConfig.tenant, session, plan, readinessPlan);
  const intentScore = scoreIntentEnvelope(intentEnvelope);

  const workspace = hydrateWorkspaceBySession(session, [plan]);
  const health = inspectWorkspaceHealth(workspace);
  const gateways = inspectWorkspaceGateways(workspace);
  const workspaceScore = (health.matrixRiskScore + health.commandSurfaceScore + health.signalCoverage) / 3;

  const rawEvent = createEnvelope(
    parsedConfig.tenant,
    'recovery-operations-engine',
    'command-horizon-plan',
    {
      tenant: parsedConfig.tenant,
      runId: parsedConfig.runId,
      gapCount: gaps.length,
    },
    {
      operation: 'build-horizon-plan',
      actor: 'command-horizon-orchestrator',
      confidence: 0.91,
    },
  );

  const decoded = decodeEnvelope<{ tenant: string; runId: string }>(rawEvent);
  if (!decoded.ok) {
    return fail('failed-to-serialize-event');
  }

  repository.upsertPlan(plan).catch(() => undefined);
  repository.upsertSession(session).catch(() => undefined);

  return ok({
    tenant: parsedConfig.tenant,
    runId: parsedConfig.runId,
    profile,
    readinessHorizon,
    forecastWindows,
    forecastSeries,
    gaps,
    intentEnvelope,
    intentScore,
    workspaceScore,
    eventEnvelope: rawEvent,
  });
};

export const compareWithHistoricForecast = (
  current: ForecastSeries,
  historic: ForecastSeries,
): { readonly improved: boolean; readonly trend: 'up' | 'down' | 'flat'; readonly deltas: readonly string[] } => {
  const comparison = compareForecasts(historic, current);
  const deltas: string[] = [];

  if (!comparison.ok) {
    return {
      improved: false,
      trend: 'down',
      deltas: ['compare-failed'],
    };
  }

  for (const diff of comparison.value) {
    deltas.push(`${diff.vector}:${diff.trend}:${diff.delta}`);
  }

  return {
    improved: comparison.value.every((diff) => diff.trend === 'improving'),
    trend: comparison.value.some((diff) => diff.trend === 'degrading')
      ? 'down'
      : comparison.value.some((diff) => diff.trend === 'improving')
        ? 'up'
        : 'flat',
    deltas,
  };
};

export const inspectHorizonSignals = (
  plan: CommandHorizonPlan,
): CommandHorizonStatus => {
  const hasCriticalGap = plan.gaps.some((gap) => gap.severity > 0.7);
  const topSignals = plan.intentEnvelope.matrix
    .filter((entry) => entry.selected)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5)
    .map((entry) => `${entry.phase}:${entry.vector}`);

  const eventSummary = buildWorkspaceSummaryFromPlan(
    {
      tenant: plan.tenant,
      runId: plan.runId,
      source: 'command-horizon',
      summary: `intentScore=${plan.intentScore}`,
      observedAt: new Date().toISOString(),
    },
    'ops-platform',
  );

  return {
    tenant: plan.tenant,
    hasCriticalGap,
    topSignals,
    gatewayCount: Math.round(plan.workspaceScore * 100),
    eventTrace: [
      ...topSignals,
      `windows=${plan.forecastWindows.windows.length}`,
      `gaps=${plan.gaps.length}`,
      `workspace=${eventSummary}`,
      `horizonVersion=${plan.readinessHorizon.version}`,
    ],
  };
};
