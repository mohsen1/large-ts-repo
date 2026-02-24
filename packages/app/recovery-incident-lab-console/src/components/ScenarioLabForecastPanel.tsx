import { type ReactElement, useMemo } from 'react';
import { type IncidentLabScenario } from '@domain/recovery-incident-lab-core';

interface Props {
  readonly scenario?: IncidentLabScenario;
}

interface ForecastPoint {
  readonly minute: number;
  readonly stepName: string;
}

const buildForecast = (scenario?: IncidentLabScenario): readonly ForecastPoint[] => {
  if (!scenario) {
    return [];
  }

  let cursor = 0;
  return scenario.steps.map((step) => {
    cursor += step.expectedDurationMinutes;
    return {
      minute: cursor,
      stepName: step.label,
    };
  });
};

export const ScenarioLabForecastPanel = ({ scenario }: Props): ReactElement => {
  const forecast = useMemo(() => buildForecast(scenario), [scenario]);

  return (
    <section className="scenario-lab-forecast-panel">
      <h2>Recovery forecast</h2>
      <ul>
        {forecast.map((point) => (
          <li key={`${point.minute}-${point.stepName}`}>{point.minute}m: {point.stepName}</li>
        ))}
      </ul>
      <p>Total horizon: {forecast.length === 0 ? 0 : forecast[forecast.length - 1].minute}m</p>
    </section>
  );
};
