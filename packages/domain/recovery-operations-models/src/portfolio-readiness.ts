import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import type { RunSession, RunPlanSnapshot, RecoverySignal } from './types';
import type { CommandSurfaceSnapshot } from './command-surface';
import type { ProgramReadiness } from './orchestration-matrix';

export interface PortfolioSignalDimension {
  readonly dimension: string;
  readonly signalCount: number;
  readonly averageSeverity: number;
  readonly confidence: number;
}

export interface PortfolioPlanState {
  readonly tenant: string;
  readonly planId: string;
  readonly generatedAt: string;
  readonly readiness: number;
  readonly readinessByDimension: readonly PortfolioSignalDimension[];
  readonly blockedCount: number;
  readonly routeConfidence: number;
}

export interface PortfolioReadinessBoard {
  readonly boardId: Brand<string, 'PortfolioBoardId'>;
  readonly tenant: string;
  readonly states: readonly PortfolioPlanState[];
  readonly topRecommendation: string;
  readonly alertCount: number;
}

const dimensions = ['severity', 'confidence', 'blast', 'latency', 'compliance'] as const;

const normalize = (value: number): number => Math.max(0, Math.min(1, value / 10));

const toDimension = (signal: RecoverySignal, dimension: string): PortfolioSignalDimension => ({
  dimension,
  signalCount: 1,
  averageSeverity: signal.severity,
  confidence: signal.confidence,
});

const dimensionScore = (signals: readonly RecoverySignal[], index: number): PortfolioSignalDimension => {
  const dimension = dimensions[index % dimensions.length];
  const items = signals.filter((signal) => signal.details[dimension] !== undefined);
  if (!items.length) {
    return { dimension, signalCount: 0, averageSeverity: 0, confidence: 0 };
  }

  return {
    dimension,
    signalCount: items.length,
    averageSeverity: normalize(items.reduce((sum, signal) => sum + signal.severity, 0) / items.length),
    confidence: normalize(items.reduce((sum, signal) => sum + signal.confidence, 0) / items.length),
  };
};

const readinessFromReadinessProfile = (readiness: ProgramReadiness): number => {
  const cellRatio = Math.min(1, readiness.matrix.rows.length ? readiness.completionScore : 0);
  const blockedLanes = readiness.lanes.filter((lane) => lane.parallelizable).length;
  const laneRatio = Math.min(1, blockedLanes / Math.max(1, readiness.lanes.length));
  return Number((cellRatio * 0.7 + laneRatio * 0.3).toFixed(3));
};

const blockedFromSurface = (surface: CommandSurfaceSnapshot): number =>
  surface.entries.filter((entry) => entry.bucket === 'critical' || entry.bucket === 'high').length;

const toPlanState = (
  tenant: string,
  snapshot: RunPlanSnapshot,
  signalSummaries: readonly PortfolioSignalDimension[],
  readiness: ProgramReadiness,
  surface: CommandSurfaceSnapshot,
): PortfolioPlanState => ({
  tenant,
  planId: snapshot.id,
  generatedAt: new Date().toISOString(),
  readiness: readinessFromReadinessProfile(readiness),
  readinessByDimension: signalSummaries,
  blockedCount: blockedFromSurface(surface),
  routeConfidence: 1 - Math.min(1, blockedFromSurface(surface) / Math.max(1, surface.entries.length)),
});

export const buildPortfolioReadinessBoard = (
  tenant: string,
  session: RunSession,
  plans: readonly RunPlanSnapshot[],
  readinessProfiles: readonly ProgramReadiness[],
  surfaces: readonly CommandSurfaceSnapshot[],
): PortfolioReadinessBoard => {
  const entries = plans.map((snapshot, index) => {
    const readiness = readinessProfiles[index] ?? readinessProfiles[0];
    const surface = surfaces[index] ?? surfaces[0];
    if (!readiness || !surface) {
      return {
        tenant,
        planId: snapshot.id,
        generatedAt: new Date().toISOString(),
        readiness: 0,
        readinessByDimension: [],
        blockedCount: 0,
        routeConfidence: 0,
      };
    }

    const dimensionsSummary = dimensions.map((_, dimensionIndex) =>
      dimensionScore(session.signals, dimensionIndex),
    );

    return toPlanState(tenant, snapshot, dimensionsSummary, readiness, surface);
  });

  const sortedByReadiness = [...entries].sort((left, right) => right.readiness - left.readiness);
  const topRecommendation = sortedByReadiness[0]?.planId
    ? `Focus remediation on ${sortedByReadiness[0].planId}`
    : 'No active plans yet';

  return {
    boardId: withBrand(`${tenant}:portfolio-${session.runId}`, 'PortfolioBoardId'),
    tenant,
    states: sortedByReadiness,
    topRecommendation,
    alertCount: entries.reduce((sum, state) => sum + state.blockedCount, 0),
  };
};

export const buildSignalDimensionMap = (signals: readonly RecoverySignal[]): Record<string, PortfolioSignalDimension> => {
  return dimensions.reduce<Record<string, PortfolioSignalDimension>>((acc, dimension) => {
    const selected = signals.filter((signal) => signal.details[dimension] !== undefined);
    const next = toDimension(selected[0] ?? { severity: 0, confidence: 0, details: {} } as RecoverySignal, dimension);
    acc[dimension] = next;
    return acc;
  }, {});
};
