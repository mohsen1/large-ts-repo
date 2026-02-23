import { useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import { InMemoryRecoveryOperationsRepository } from '@data/recovery-operations-store';
import { InMemoryRecoveryOperationsRepository as DataRepository } from '@data/recovery-operations-store/repository';
import { buildCommandHorizonPlan, compareWithHistoricForecast, inspectHorizonSignals, type CommandHorizonConfig, type CommandHorizonPlan } from '@service/recovery-operations-engine/command-horizon-orchestrator';
import type { ReadinessProfile, RecoveryOperationsEnvelope, RecoverySignal, RunPlanSnapshot, RunSession } from '@domain/recovery-operations-models';
import { buildIntentBand } from '@domain/recovery-operations-models/command-intent-band';
import { buildReadinessProfile } from '@domain/recovery-operations-models/operations-readiness';
import { buildReadinessSnapshot } from '@domain/recovery-operations-models';
import { buildReadinessHorizon } from '@domain/recovery-operations-models/readiness-horizon';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { routeSignals } from '@data/recovery-operations-store/signal-router';

interface Input {
  readonly tenant: string;
  readonly session: RunSession;
  readonly plan: RunPlanSnapshot;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly rawSignals: readonly RecoveryOperationsEnvelope<RecoverySignal>[];
}

interface Output {
  readonly tenant: string;
  readonly profile: ReadinessProfile;
  readonly plan: CommandHorizonPlan;
  readonly forecastState: ReturnType<typeof compareWithHistoricForecast>;
  readonly routeCounts: Record<string, number>;
  readonly topSignals: readonly string[];
  readonly statusTrace: readonly string[];
  readonly reload: () => void;
}

const summarizeRoute = (rawSignals: readonly RecoveryOperationsEnvelope<RecoverySignal>[], tenant: string, session: RunSession) => {
  const routed = routeSignals(tenant, session, rawSignals);
  const matrix = routed.routed.reduce(
    (acc, item) => {
      acc[item.route] = (acc[item.route] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  return matrix;
};

export const useRecoveryOperationsOrchestrationWorkspace = ({
  tenant,
  session,
  plan,
  readinessPlan,
  rawSignals,
}: Input): Output => {
  const [previousPlan, setPreviousPlan] = useState<CommandHorizonPlan | undefined>(undefined);

  const readinessProfile = useMemo(() => {
    const snapshot = buildReadinessSnapshot(tenant, session, plan, readinessPlan);
    return buildReadinessProfile(tenant, {
      tenant,
      key: withBrand(`${tenant}:profile:${session.id}`, 'ReadinessEnvelopeKey'),
      snapshots: [snapshot],
      trend: snapshot.score,
      summary: 'console-aggregated',
    });
  }, [tenant, session, plan, readinessPlan]);

  const routeCounts = useMemo(() => summarizeRoute(rawSignals, tenant, session), [rawSignals, tenant, session]);
  const intentBand = useMemo(() => buildIntentBand(tenant, session, plan, readinessPlan), [tenant, session, plan, readinessPlan]);
  const horizonBucket = useMemo(
    () => buildReadinessHorizon(tenant, String(session.runId), readinessProfile.snapshots, session.signals, 'hour'),
    [tenant, session, readinessProfile],
  );

  const planResult = useMemo(() => {
    const config: CommandHorizonConfig = {
      tenant,
      runId: String(session.runId),
      resolution: 'hour',
      maxWindows: 12,
    };

    const repository = new DataRepository();
    void repository.upsertSession(session);
    void repository.upsertPlan(plan);

    const built = buildCommandHorizonPlan(config, session, plan, readinessPlan, rawSignals, repository);
    if (!built.ok) {
      throw new Error(`Failed to build plan: ${built.error}`);
    }
    return built.value;
  }, [tenant, session, plan, readinessPlan, rawSignals]);

  const forecastState = useMemo(() => {
    if (!previousPlan) {
      return compareWithHistoricForecast(planResult.forecastSeries, planResult.forecastSeries);
    }
    return compareWithHistoricForecast(planResult.forecastSeries, previousPlan.forecastSeries);
  }, [planResult, previousPlan]);

  const topSignals = useMemo(() => {
    const grouped = Object.entries(routeCounts)
      .map(([route, count]) => ({ route, count }))
      .sort((left, right) => right.count - left.count)
      .map((entry) => `${entry.route}:${entry.count}`);

    return [
      ...grouped,
      `top-intent-entries=${intentBand.signals.length}`,
      ...horizonBucket.buckets
        .slice(0, 3)
        .flatMap((bucket) => bucket.atRiskVectors)
        .map((vector) => `risk:${vector}`),
    ];
  }, [routeCounts, intentBand, horizonBucket]);

  const status = useMemo(() => inspectHorizonSignals(planResult), [planResult]);

  const reload = () => {
    setPreviousPlan(planResult);
  };

  return {
    tenant,
    profile: readinessProfile,
    plan: planResult,
    forecastState,
    routeCounts,
    topSignals,
    statusTrace: status.eventTrace,
    reload,
  };
};
