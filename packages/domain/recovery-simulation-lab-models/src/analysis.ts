import type {
  RecoverySimulationLabResult,
  SimulationBandSignal,
  SimulationPlanProjection,
  SimulationExecutionLedger,
  SimulationOutcomeEstimate,
} from './types';

export interface AnalysisSummary {
  readonly dominantBand: 'steady' | 'elevated' | 'critical' | 'extreme';
  readonly confidence: number;
  readonly warningCount: number;
  readonly projectedDurationMinutes: number;
  readonly topSignals: readonly SimulationBandSignal[];
}

const dominantBand = (signals: readonly SimulationBandSignal[]): AnalysisSummary['dominantBand'] => {
  const score = signals.reduce((sum, signal) => sum + signal.score, 0) / Math.max(1, signals.length);
  if (score >= 0.8) return 'extreme';
  if (score >= 0.6) return 'critical';
  if (score >= 0.4) return 'elevated';
  return 'steady';
};

export const summarizeResult = (result: RecoverySimulationLabResult): AnalysisSummary => ({
  dominantBand: dominantBand(result.estimate.bandSignals),
  confidence: Math.max(0, Math.min(1, result.estimate.confidence)),
  warningCount: result.ledger.warnings.length,
  projectedDurationMinutes: Math.max(1, Math.round((new Date(result.projection.projectedEndAt).getTime() - new Date(result.projection.projectedStartAt).getTime()) / 60_000)),
  topSignals: result.estimate.bandSignals.slice(0, 5),
});

export const buildSummaryLines = (result: AnalysisSummary): readonly string[] => [
  `dominant=${result.dominantBand}`,
  `confidence=${result.confidence.toFixed(2)}`,
  `warnings=${result.warningCount}`,
  `duration=${result.projectedDurationMinutes}m`,
  ...result.topSignals.map((signal) => `${signal.stepId}:${signal.band}:${signal.score.toFixed(2)}`),
];

export const estimateFromProjection = (projection: SimulationPlanProjection): number =>
  Math.max(1, Math.round((new Date(projection.projectedEndAt).getTime() - new Date(projection.projectedStartAt).getTime()) / 60_000));

export const describeLedger = (ledger: SimulationExecutionLedger): readonly string[] => ledger.warnings.map((warning) => warning.toUpperCase());

export const hasHighRisk = (result: RecoverySimulationLabResult): boolean => {
  const band = dominantBand(result.estimate.bandSignals);
  return band === 'critical' || band === 'extreme';
};

export const buildRiskNarrative = (estimate: SimulationOutcomeEstimate, ledger: SimulationExecutionLedger): string => {
  const riskBand = estimate.residualRisk >= 0.7 ? 'critical' : estimate.residualRisk >= 0.4 ? 'elevated' : 'steady';
  const top = estimate.bandSignals.length === 0 ? 'none' : estimate.bandSignals[0].stepId;
  return `${riskBand} residual=${estimate.residualRisk.toFixed(2)} leader=${top} warnings=${ledger.warnings.length}`;
};
