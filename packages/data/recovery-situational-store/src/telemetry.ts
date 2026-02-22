import type { SituationalAssessment, SituationalStoreQuery } from './types';

export interface SituationalTelemetry {
  readonly workloadNodeId: string;
  readonly assessmentsCount: number;
  readonly activeSignals: number;
  readonly planCoverage: number;
  readonly averageConfidence: number;
}

export const assessTelemetry = (query: SituationalStoreQuery, assessments: readonly SituationalAssessment[]): SituationalTelemetry => {
  const relevant = query.workloadNodeIds.length
    ? assessments.filter((entry) => query.workloadNodeIds.includes(entry.workload.nodeId))
    : assessments;

  const active = relevant.filter((assessment) => assessment.status === 'running' || assessment.status === 'queued').length;
  const confidence = relevant.length
    ? relevant.reduce((acc, assessment) => acc + assessment.weightedConfidence, 0) / relevant.length
    : 0;
  const withHighConfidence = relevant.filter((assessment) => assessment.plan.confidence > 0.5).length;
  const percentage = relevant.length ? Math.round((withHighConfidence / relevant.length) * 100) : 0;

  return {
    workloadNodeId: query.workloadNodeIds[0] ?? 'all',
    assessmentsCount: relevant.length,
    activeSignals: relevant.reduce((acc, assessment) => acc + assessment.signalCount, 0),
    planCoverage: Math.max(0, Math.min(100, percentage)),
    averageConfidence: Number(confidence.toFixed(4)),
  };
};

export const filterAssessmentsByConfidence = (
  assessments: readonly SituationalAssessment[],
  minConfidence: number,
): readonly SituationalAssessment[] => assessments.filter((assessment) => assessment.weightedConfidence >= minConfidence);
