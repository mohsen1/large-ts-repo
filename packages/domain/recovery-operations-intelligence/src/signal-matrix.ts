import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import type { RecoveryRiskSignal, CohortSignalAggregate, RunAssessment } from './types';
import type { RecoverySignal } from '@domain/recovery-operations-models';

export type SignalMatrixId = Brand<string, 'SignalMatrixId'>;
export type MatrixAxis = Brand<string, 'MatrixAxis'>;

export interface SignalHeatPoint {
  readonly axis: MatrixAxis;
  readonly runId: string;
  readonly tenant: string;
  readonly severity: number;
  readonly confidence: number;
  readonly source: RecoveryRiskSignal['source'];
  readonly tags: readonly string[];
}

export interface SignalHeatMatrix {
  readonly matrixId: SignalMatrixId;
  readonly createdAt: string;
  readonly axisBuckets: readonly MatrixAxis[];
  readonly points: readonly SignalHeatPoint[];
  readonly bounds: {
    readonly minSeverity: number;
    readonly maxSeverity: number;
    readonly avgConfidence: number;
  };
}

export interface CohortPressure {
  readonly axis: MatrixAxis;
  readonly bucket: 'low' | 'medium' | 'high' | 'critical';
  readonly pressure: number;
  readonly signals: number;
}

export interface CohortHeatProfile {
  readonly tenant: string;
  readonly runId: string;
  readonly pressures: readonly CohortPressure[];
  readonly totalSignals: number;
  readonly topBucket: MatrixAxis;
}

const severityBuckets: readonly { bucket: CohortPressure['bucket']; from: number; to: number }[] = [
  { bucket: 'low', from: 0, to: 3.3 },
  { bucket: 'medium', from: 3.3, to: 6.6 },
  { bucket: 'high', from: 6.6, to: 8.5 },
  { bucket: 'critical', from: 8.5, to: 10.1 },
];

const bucketForSeverity = (severity: number): CohortPressure['bucket'] => {
  const bucket = severityBuckets.find((entry) => severity >= entry.from && severity <= entry.to);
  return bucket ? bucket.bucket : 'low';
};

const axisForSignal = (signal: RecoveryRiskSignal): MatrixAxis =>
  withBrand(`${signal.window.zone}/${signal.source}`, 'MatrixAxis');

export const buildSignalHeatMatrix = (
  tenant: string,
  runId: string,
  signals: readonly RecoveryRiskSignal[],
): SignalHeatMatrix => {
  const points: SignalHeatPoint[] = [];
  const axisSet = new Set<string>();

  for (const signal of signals) {
    const axis = axisForSignal(signal);
    axisSet.add(axis);
    points.push({
      axis,
      runId,
      tenant,
      severity: signal.signal.severity,
      confidence: signal.signal.confidence,
      source: signal.source,
      tags: [...signal.tags],
    });
  }

  const severities = points.map((point) => point.severity);
  const avgConfidence =
    points.length === 0 ? 0 : points.reduce((acc, point) => acc + point.confidence, 0) / points.length;
  return {
    matrixId: withBrand(`${tenant}-${runId}-matrix`, 'SignalMatrixId'),
    createdAt: new Date().toISOString(),
    axisBuckets: [...axisSet].map((axis) => withBrand(axis, 'MatrixAxis')),
    points,
    bounds: {
      minSeverity: Math.min(...severities, 0),
      maxSeverity: Math.max(...severities, 0),
      avgConfidence,
    },
  };
};

const toCohortAggregate = (axis: MatrixAxis, points: readonly SignalHeatPoint[]): CohortPressure => {
  const bucketed = points.reduce(
    (acc, point) => {
      const bucket = bucketForSeverity(point.severity);
      const pressure = bucket === 'critical' ? 2 : bucket === 'high' ? 1.5 : 1;
      return {
        bucket,
        pressure: acc.pressure + pressure,
        signals: acc.signals + 1,
      };
    },
    { bucket: 'low' as CohortPressure['bucket'], pressure: 0, signals: 0 },
  );

  return {
    axis,
    bucket: bucketed.bucket,
    pressure: Number(bucketed.pressure.toFixed(2)),
    signals: bucketed.signals,
  };
};

export const buildCohortPressureProfile = (
  matrix: SignalHeatMatrix,
  maxSignals = 64,
): CohortHeatProfile[] => {
  const grouped = new Map<string, SignalHeatPoint[]>();
  for (const point of matrix.points) {
    const tenantRunKey = `${point.tenant}::${point.runId}::${point.axis}`;
    grouped.set(tenantRunKey, [...(grouped.get(tenantRunKey) ?? []), point]);
  }

  const profiles: CohortHeatProfile[] = [];
  for (const [tenantRunKey, points] of grouped) {
    const [tenant, runId] = tenantRunKey.split('::');
    const byAxis = new Map<string, SignalHeatPoint[]>();
    for (const point of points) {
      const axisPoints = byAxis.get(point.axis) ?? [];
      axisPoints.push(point);
      byAxis.set(point.axis, axisPoints);
    }
    const pressures = Array.from(byAxis).map(([axis, groupedPoints]) => toCohortAggregate(withBrand(axis, 'MatrixAxis'), groupedPoints));
    const top = pressures.toSorted((left, right) => right.pressure - left.pressure)[0] ?? pressures[0];
    profiles.push({
      tenant,
      runId,
      pressures: pressures.slice(0, maxSignals),
      totalSignals: points.length,
      topBucket: top?.axis ?? withBrand('global/queue', 'MatrixAxis'),
    });
  }
  return profiles;
};

export const assessCohortSignals = (
  tenant: string,
  runId: string,
  cohorts: readonly CohortSignalAggregate[],
): RunAssessment[] => {
  return cohorts.map((cohort, index) => ({
    runId: cohort.runId,
    tenant,
    riskScore: cohort.count * (index + 1) * 0.25,
    confidence: cohort.maxConfidence,
    bucket: cohort.count > 6 ? 'critical' : cohort.count > 3 ? 'high' : cohort.count > 1 ? 'medium' : 'low',
    intensity: {
      bucket: cohort.count > 6 ? 'critical' : cohort.count > 3 ? 'high' : 'low',
      averageSeverity: cohort.maxConfidence * 10,
      signalCount: cohort.count,
    },
    constraints: {
      maxParallelism: Math.max(1, cohort.count),
      maxRetries: Math.max(1, Math.floor(cohort.count / 2)),
      timeoutMinutes: 15 + cohort.count,
      operatorApprovalRequired: cohort.count >= 8,
    },
    recommendedActions: ['stabilize', 'route', 'notify'],
    plan: {
      id: runId as never,
      name: `Assessment ${cohort.runId} ${cohort.tenant}`,
      program: {
        id: runId as never,
        tenant: cohort.tenant as never,
        service: withBrand(`${cohort.runId}-service`, 'ServiceId'),
        name: 'Signal profile program',
        description: 'Auto-generated plan from matrix pressure profile',
        priority: 'silver',
        mode: 'defensive',
        window: {
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
          timezone: 'UTC',
        },
        topology: {
          rootServices: ['recovery'],
          fallbackServices: ['manual'],
          immutableDependencies: [],
        },
        constraints: [],
        steps: [
          {
            id: `${tenant}-plan-step-1`,
            title: 'Mitigation',
            command: 'mitigate',
            timeoutMs: 20_000,
            dependencies: [],
            requiredApprovals: Math.min(2, cohort.count),
            tags: ['auto'],
          },
          {
            id: `${tenant}-plan-step-2`,
            title: 'Audit',
            command: 'audit',
            timeoutMs: 30_000,
            dependencies: [`${tenant}-plan-step-1`],
            requiredApprovals: 0,
            tags: ['audit'],
          },
        ],
        owner: tenant,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ['signal-matrix'],
      } as never,
      constraints: {
        maxParallelism: Math.max(1, cohort.count),
        maxRetries: 2,
        timeoutMinutes: 30,
        operatorApprovalRequired: cohort.count >= 5,
      },
      fingerprint: {
        tenant: cohort.tenant,
        region: 'us-east-1',
        serviceFamily: 'incident-response',
        impactClass: 'platform',
        estimatedRecoveryMinutes: 14,
      },
      sourceSessionId: undefined,
      effectiveAt: new Date().toISOString(),
    } as never,
  }));
};

export const deriveSignalsByAxis = (signals: readonly RecoverySignal[]): readonly { readonly axis: string; readonly count: number }[] => {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    const axis = `${signal.source ?? 'unknown'}:${signal.id}`;
    counts.set(axis, (counts.get(axis) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([axis, count]) => ({ axis, count }))
    .sort((left, right) => right.count - left.count);
};
