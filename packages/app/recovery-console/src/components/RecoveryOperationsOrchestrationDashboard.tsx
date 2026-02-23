import { useMemo, type ReactElement } from 'react';
import type { CommandHorizonPlan } from '@service/recovery-operations-engine/command-horizon-orchestrator';
import { useRecoveryOperationsOrchestrationWorkspace } from '../hooks/useRecoveryOperationsOrchestrationWorkspace';
import { useRecoveryCommandForecast } from '../hooks/useRecoveryCommandForecast';
import { ReadinessHorizonChart } from './ReadinessHorizonChart';
import { ForecastPulseTimeline } from './ForecastPulseTimeline';
import { OperationsReadinessPanel } from './OperationsReadinessPanel';
import type {
  RecoveryOperationsEnvelope,
  RecoverySignal,
  RunPlanSnapshot,
  RunSession,
} from '@domain/recovery-operations-models';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';

interface Props {
  readonly tenant: string;
  readonly session: RunSession;
  readonly plan: RunPlanSnapshot;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoveryOperationsEnvelope<RecoverySignal>[];
  readonly previousPlan?: CommandHorizonPlan;
}

export const RecoveryOperationsOrchestrationDashboard = ({
  tenant,
  session,
  plan,
  readinessPlan,
  signals,
  previousPlan,
}: Props): ReactElement => {
  const orchestration = useRecoveryOperationsOrchestrationWorkspace({
    tenant,
    session,
    plan,
    readinessPlan,
    rawSignals: signals,
  });

  const forecast = useRecoveryCommandForecast({
    tenant,
    session,
    plan,
    readinessPlan,
    signals,
    previousForecast: previousPlan?.forecastSeries,
  });

  const statusLine = useMemo(
    () => [
      ...orchestration.statusTrace,
      ...forecast.labels,
      ...orchestration.topSignals,
    ],
    [orchestration.statusTrace, forecast.labels, orchestration.topSignals],
  );

  const metrics = useMemo(
    () => ({
      tenant,
      planId: plan.id,
      signalCount: signals.length,
      planRun: String(session.runId),
      forecastPoints: forecast.current.points.length,
      gapCount: forecast.gaps.length,
      routeSignals: Object.values(orchestration.routeCounts).reduce((acc, count) => acc + count, 0),
      score: forecast.riskScore,
    }),
    [tenant, plan.id, signals.length, session.runId, forecast.current.points.length, forecast.gaps.length, orchestration.routeCounts, forecast.riskScore],
  );

  return (
    <section className="recovery-operations-orchestration-dashboard">
      <header>
        <h2>Operations orchestration dashboard</h2>
        <p>{tenant}</p>
      </header>

      <OperationsReadinessPanel profile={orchestration.profile} />

      <article>
        <h3>Workspace score</h3>
        <p>{orchestration.profile.averageScore.toFixed(4)}</p>
        <p>{orchestration.profile.worstProjection}</p>
      </article>

      <article>
        <h3>Intent summary</h3>
        {Object.entries(orchestration.routeCounts).map(([key, value]) => (
          <p key={key}>
            {key}: {value}
          </p>
        ))}
        <p>Forecast trend: {forecastStateName(forecast.diff)}</p>
      </article>

      <ReadinessHorizonChart buckets={forecast.horizonSeries.buckets} />
      <ForecastPulseTimeline points={forecast.current.points} />

      <article>
        <h3>Hot indicators</h3>
        <ul>
          {forecast.isHot && <li>high-risk forecast detected</li>}
          {statusLine.length === 0 ? <li>No signals</li> : null}
          {statusLine.slice(0, 10).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </article>

      <article>
        <h3>Plan metrics</h3>
        {Object.entries(metrics).map(([name, value]) => (
          <p key={name}>
            {name}: {String(value)}
          </p>
        ))}
      </article>
    </section>
  );
};

const forecastStateName = (value: ReturnType<typeof useRecoveryCommandForecast>['diff']): string => {
  if (!value.ok) {
    return 'unknown';
  }
  if (value.value.length === 0) {
    return 'flat';
  }
  const first = value.value[0];
  return first.trend === 'improving' ? 'improving' : 'degrading';
};
