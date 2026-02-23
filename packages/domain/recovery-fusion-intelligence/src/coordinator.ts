import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import { withBrand } from '@shared/core';
import type {
  FusionBundle,
  FusionPlanRequest,
  FusionPlanResult,
  FusionReadinessState,
} from './types';
import { evaluateBundle } from './evaluator';
import { buildCommandCatalog, summarizeCatalog } from './command-catalog';
import { buildBundleTelemetry, summarizeTelemetry } from './telemetry-analytics';
import { ingestSignals } from './signal-ingestion';
import { scheduleBundle } from './schedule-engine';

export interface CoordinationRawSignalEnvelope {
  readonly tenant: string;
  readonly runId: string;
  readonly source: string;
  readonly signalId?: string;
  readonly severity?: number;
  readonly observedAt?: string;
  readonly commandId?: string;
  readonly payload?: Record<string, unknown>;
}

export interface CoordinationWorkspace {
  readonly request: FusionPlanRequest;
  readonly state: FusionReadinessState;
  readonly waves: readonly string[];
  readonly diagnostics: readonly string[];
  readonly commandCount: number;
}

export interface CoordinationContext {
  readonly tenant: string;
  readonly correlationId: string;
  readonly initiatedBy: string;
}

export const coordinateFusionBundle = (
  request: FusionPlanRequest,
  context: CoordinationContext,
): Result<{
  readonly plan: FusionPlanResult;
  readonly workspace: CoordinationWorkspace;
}, Error> => {
  const bundle: FusionBundle = {
    id: request.planId,
    tenant: context.tenant,
    runId: request.runId,
    session: {
      id: withBrand(`${context.correlationId}:session`, 'RunSessionId'),
      runId: request.runId,
      ticketId: withBrand(`${context.correlationId}:ticket`, 'RunTicketId'),
      planId: request.planId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      constraints: request.budget,
      signals: [],
    },
    planId: request.planId,
    waves: request.waves,
    signals: request.signals,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };

  const catalog = buildCommandCatalog(bundle);
  const schedule = scheduleBundle(bundle);
  if (!schedule.ok) return fail(schedule.error);

  const topology = {
    nodes: catalog.clusters.flatMap((cluster) => cluster.entries.map((entry) => ({
      id: entry.id,
      label: entry.rationale,
      weight: entry.actionScore,
      parents: [entry.actor],
      children: entry.tags,
    }))),
    edges: catalog.clusters.flatMap((cluster) => cluster.entries.map((entry, index) => ({
      from: entry.id,
      to: `${entry.id}:${index}`,
      latencyMs: 120,
      riskPenalty: 1 - entry.actionScore,
    }))),
  };

  const telemetry = buildBundleTelemetry(bundle, topology);
  if (!telemetry.ok) return fail(telemetry.error);

  const evaluation = evaluateBundle(bundle, topology);
  if (!evaluation.ok) return fail(evaluation.error);

  const summary = summarizeCatalog(catalog).topRationales;
  const riskBand = evaluation.value.risks.length > 0 ? 'red' : 'green';
  const reasons = [
    `correlation=${context.correlationId}`,
    `initiatedBy=${context.initiatedBy}`,
    `topology=${telemetry.value.topology.density.toFixed(2)}`,
    ...summary,
    ...summarizeTelemetry(telemetry.value),
  ];

  return ok({
    plan: {
      accepted: reasons.length > 0,
      bundleId: bundle.id,
      waveCount: bundle.waves.length,
      estimatedMinutes: schedule.value.commandDensity * 2,
      riskBand,
      reasons,
    },
    workspace: {
      request,
      state: schedule.value.criticalWaveIds.length > 0 ? 'warming' : 'running',
      waves: schedule.value.rankedWaveIds,
      diagnostics: schedule.value.diagnostics,
      commandCount: schedule.value.commandDensity > 0 ? Math.round(schedule.value.commandDensity * 10) : 0,
    },
  });
};

export const applyFusionSignals = (
  bundle: FusionBundle,
  signals: readonly CoordinationRawSignalEnvelope[],
): Result<{
  readonly accepted: number;
  readonly rejected: number;
  readonly scheduled: readonly string[];
}, Error> => {
  const ingested = ingestSignals(bundle, signals);
  if (!ingested.ok) return fail(ingested.error);
  return ok({
    accepted: ingested.value.events.filter((event) => event.status !== 'rejected').length,
    rejected: ingested.value.rejected.length,
    scheduled: ingested.value.bucketed.flatMap((bucket) => bucket.wave.id),
  });
};
