import { useMemo } from 'react';
import type { ReadinessReadModel } from '@data/recovery-readiness-store';
import { mapImpactSignals, projectSignals, type ReadinessSignal } from '@domain/recovery-readiness';
import { summarizeOrchestratorState } from '@service/recovery-readiness-orchestrator';
import { buildSignalDensityTimeline, topSignalsByRun } from '@data/recovery-readiness-store';

interface ReadinessForecastCardProps {
  readonly model: ReadinessReadModel;
}

interface ForecastWindow {
  readonly ts: string;
  readonly value: number;
}

interface ReadnessForecastState {
  readonly windows: readonly ForecastWindow[];
  readonly topSignals: readonly ReadinessSignal[];
  readonly confidence: number;
  readonly health: string;
}

export const ReadinessForecastCard = ({ model }: ReadinessForecastCardProps) => {
  const forecast = useMemo(() => {
    const forecastPlan = projectSignals(model.plan.runId, model.signals, {
      baseSignalDensity: model.signals.length,
      volatilityWindowMinutes: 60,
    });
    return {
      windows: forecastPlan.forecast.projectedSignals,
      confidence: forecastPlan.forecast.confidence,
    };
  }, [model]);

  const impact = useMemo(() => mapImpactSignals(model.signals, model.directives), [model.signals, model.directives]);
  const topSignals = useMemo(() => topSignalsByRun([model], model.plan.runId), [model]);
  const timeline = useMemo(() => buildSignalDensityTimeline([model]), [model]);
  const summary = useMemo(() => summarizeOrchestratorState([model]), [model]);

  const state = useMemo<ReadnessForecastState>(() => {
    return {
      windows: forecast.windows.map((entry) => ({ ts: entry.ts, value: entry.value })),
      topSignals,
      confidence: Number(forecast.confidence.toFixed(3)),
      health: summary.totalActive > 0 ? 'active' : 'idle',
    };
  }, [forecast, summary.totalActive, topSignals]);

  return (
    <section>
      <h3>Run forecast</h3>
      <p>{`run:${model.plan.runId}`}</p>
      <p>{`confidence:${state.confidence}`}</p>
      <p>{`risk:${impact.summary.signalVolume}`}</p>
      <p>{`health:${state.health}`}</p>
      <h4>Top signals</h4>
      <ul>
        {state.topSignals.map((signal) => (
          <li key={signal.signalId}>
            {signal.signalId}: {signal.name}
          </li>
        ))}
      </ul>
      <h4>Timeline density</h4>
      <p>{timeline.length}</p>
      <h4>Forecast windows</h4>
      <ul>
        {state.windows.slice(0, 8).map((window) => (
          <li key={window.ts}>
            {window.ts}: {window.value}
          </li>
        ))}
      </ul>
    </section>
  );
};
