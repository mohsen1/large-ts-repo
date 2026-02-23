import { useMemo } from 'react';
import { compareForecasts, buildForecastSeries, type ForecastSeries } from '@domain/recovery-operations-models/forecast-matrix';
import { buildReadinessSnapshot } from '@domain/recovery-operations-models';
import {
  buildReadinessHorizon,
  summarizeHorizonGaps,
  enrichHorizonProfile,
  type HorizonGap,
  type HorizonSeries,
} from '@domain/recovery-operations-models/readiness-horizon';
import type {
  RecoverySignal,
  ReadinessProfile,
  RunPlanSnapshot,
  RunSession,
} from '@domain/recovery-operations-models';
import type { ReadinessProfile as OperationsReadinessProfile } from '@domain/recovery-operations-models/operations-readiness';
import { withBrand } from '@shared/core';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoveryOperationsEnvelope } from '@domain/recovery-operations-models';

interface Input {
  readonly tenant: string;
  readonly session: RunSession;
  readonly plan: RunPlanSnapshot;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoveryOperationsEnvelope<RecoverySignal>[];
  readonly previousForecast?: ForecastSeries;
}

interface Output {
  readonly tenant: string;
  readonly baseline: OperationsReadinessProfile;
  readonly current: ForecastSeries;
  readonly horizonSeries: HorizonSeries;
  readonly gaps: readonly HorizonGap[];
  readonly diff: ReturnType<typeof compareForecasts>;
  readonly isHot: boolean;
  readonly riskScore: number;
  readonly labels: readonly string[];
}

export const useRecoveryCommandForecast = ({
  tenant,
  session,
  plan,
  readinessPlan,
  signals,
  previousForecast,
}: Input): Output => {
  const normalizedSignals = useMemo(() => {
    return signals
      .map((entry) => entry.payload)
      .filter((signal): signal is RecoverySignal => signal && typeof signal.id !== 'undefined');
  }, [signals]);

  const baseline = useMemo(() => {
    const primary = buildReadinessSnapshot(tenant, session, plan, readinessPlan);

    const profile: OperationsReadinessProfile = {
      tenant,
      windowMinutes: 30,
      snapshots: [primary],
      averageScore: primary.score,
      averagePressure: primary.pressure,
      worstProjection: primary.projection,
    };

    return enrichHorizonProfile(profile, [
      buildReadinessHorizon(tenant, String(session.runId), [primary], normalizedSignals, 'hour'),
      buildReadinessHorizon(tenant, String(session.runId), [primary], normalizedSignals, 'minute'),
    ]);
  }, [tenant, session, plan, readinessPlan, normalizedSignals]);

  const current = useMemo(
    () => buildForecastSeries(tenant, String(session.runId), baseline, baseline.snapshots, normalizedSignals),
    [tenant, session, baseline, normalizedSignals],
  );

  const horizonSeries = useMemo(
    () => buildReadinessHorizon(tenant, String(session.runId), baseline.snapshots, normalizedSignals, 'minute'),
    [tenant, baseline, normalizedSignals, session],
  );

  const gaps = useMemo(() => summarizeHorizonGaps(horizonSeries), [horizonSeries]);
  const diff = useMemo(() => compareForecasts(previousForecast ?? current, current), [previousForecast, current]);
  const isHot = useMemo(
    () => baseline.worstProjection === 'critical' || baseline.averagePressure > 0.7 || gaps.some((gap) => gap.severity > 0.65),
    [baseline, gaps],
  );

  const riskScore = useMemo(() => {
    const base = baseline.snapshots.reduce((acc, snapshot) => acc + snapshot.score, 0) / baseline.snapshots.length;
    const pressureDelta = baseline.averagePressure / 10;
    return Number(Math.max(0, Math.min(1, base * (isHot ? 0.7 : 1) + pressureDelta)).toFixed(4));
  }, [baseline, isHot]);

  const labels = useMemo(() => {
    const labels: string[] = [
      `tenant=${tenant}`,
      `run=${session.runId}`,
      `score=${riskScore}`,
      `points=${current.points.length}`,
      `gaps=${gaps.length}`,
      `diff=${diff.ok ? diff.value.length : 0}`,
      `plan=${plan.id}`,
    ];

    for (const point of current.points.slice(-4)) {
      labels.push(`pt:${point.riskTag}:${point.score.toFixed(2)}:${point.confidence.toFixed(2)}`);
    }

    return labels;
  }, [tenant, session, current.points, gaps.length, riskScore, plan.id, diff]);

  return {
    tenant,baseline,
    current,
    horizonSeries,
    gaps,
    diff,
    isHot,
    riskScore,
    labels,
  };
};
