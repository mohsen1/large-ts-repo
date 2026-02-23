import type { PlaybookLabCandidate, PlaybookLabRunId, PlaybookLabExecutionState, PlaybookLabTelemetryPoint, PlaybookLabCampaignPlan } from '@domain/recovery-playbook-lab';
import { buildSignalBatch } from '@domain/recovery-playbook-lab';

export interface TelemetrySeries {
  readonly campaignId: string;
  readonly points: readonly PlaybookLabTelemetryPoint[];
  readonly top: Readonly<Record<string, number>>;
}

const aggregateTop = (points: readonly PlaybookLabTelemetryPoint[]): Record<string, number> => {
  const aggregate: Record<string, number> = {};
  for (const point of points) {
    aggregate[point.lane] = (aggregate[point.lane] ?? 0) + point.score;
    aggregate.total = (aggregate.total ?? 0) + point.score;
  }
  return aggregate;
};

export const inferTelemetryFromState = (state: PlaybookLabExecutionState): TelemetrySeries => {
  return {
    campaignId: String(state.campaignId),
    points: state.telemetry,
    top: aggregateTop(state.telemetry),
  };
};

export const forecastLatency = (candidate: PlaybookLabCandidate): number => {
  return Math.max(80, candidate.estimatedRecoveryTimeMinutes * 60000 / Math.max(candidate.forecastConfidence, 1));
};

export const enrichCandidateSignals = (candidate: PlaybookLabCandidate, runId: PlaybookLabRunId): PlaybookLabCandidate => {
  const seed = buildSignalBatch(candidate.campaign.toString(), candidate.campaign, runId, 4);
  const signalRows = seed.map((row) => row.score);
  return {
    ...candidate,
    riskEnvelope: {
      ...candidate.riskEnvelope,
      score: candidate.riskEnvelope.score + signalRows.length,
      budget: Math.max(1, candidate.riskEnvelope.budget - signalRows.length),
      signals: [
        ...candidate.riskEnvelope.signals,
        ...signalRows.map((score, idx) => `${runId}:${idx}:${score.toFixed(1)}`),
      ],
    },
  };
};

export const summarizeCampaign = (campaign: PlaybookLabCampaignPlan): string => {
  const active = campaign.candidates.length;
  const avgConfidence = campaign.candidates.reduce((acc, candidate) => acc + candidate.forecastConfidence, 0) / Math.max(active, 1);
  return `campaign=${campaign.id} lane=${campaign.lens} candidates=${active} avg=${avgConfidence.toFixed(2)} status=${campaign.status}`;
};
