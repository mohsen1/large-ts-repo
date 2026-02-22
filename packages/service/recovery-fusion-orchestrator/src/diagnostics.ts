import type { FusionPlanCommand, FusionPlanRequest } from '@domain/recovery-fusion-intelligence';
import type { FusionPlanResult, FusionBundle } from '@domain/recovery-fusion-intelligence';
import { emitTelemetry, summarizeEvaluation, type FusionTelemetrySnapshot } from '@domain/recovery-fusion-intelligence';

export interface FusionDiagnosticRecord {
  readonly requestId: string;
  readonly planId: string;
  readonly runId: string;
  readonly accepted: boolean;
  readonly riskBand: string;
  readonly signalCount: number;
  readonly waveCount: number;
  readonly createdAt: string;
}

export const buildBundleCommand = (command: FusionPlanCommand): Record<string, unknown> => ({
  command: command.command,
  runId: String(command.runId),
  targetWaveId: String(command.targetWaveId),
  requestedAt: command.requestedAt,
  reason: command.reason,
});

export const summarizeCycle = (
  request: FusionPlanRequest,
  result: FusionPlanResult,
  attempt: number,
): FusionDiagnosticRecord => ({
  requestId: `${request.planId}:${request.runId}`,
  planId: request.planId,
  runId: String(request.runId),
  accepted: result.accepted,
  riskBand: result.riskBand,
  signalCount: request.signals.length,
  waveCount: result.waveCount,
  createdAt: new Date().toISOString(),
});

export const createWaveEvents = (bundle: FusionBundle): readonly string[] =>
  bundle.waves.map((wave) => `${bundle.id}:wave:${wave.id}:signals:${wave.readinessSignals.length}`);

export const renderSummary = (bundle: FusionBundle, evaluation: readonly string[]): string => {
  const waves = bundle.waves.map((wave) => `${wave.id}[${wave.commands.length}]`).join(',');
  return `bundle=${bundle.id}|waves=${waves}|eval=${evaluation.length}`;
};

export const collectEvaluation = (bundle: FusionBundle): string[] => {
  const metrics = summarizeEvaluation([]);
  return [...metrics, ...createWaveEvents(bundle)];
};

export const toTelemetry = (snapshot: FusionTelemetrySnapshot): string => emitTelemetry(snapshot);

export const buildDiagnosticSummary = (snapshot: FusionTelemetrySnapshot): string[] => {
  return snapshot.metrics.map((metric) => `${metric.name}:${metric.value}`);
};
