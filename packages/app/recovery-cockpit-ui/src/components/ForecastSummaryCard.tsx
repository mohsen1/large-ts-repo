import { FC } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildForecastEnvelope, buildPlanForecast } from '@domain/recovery-cockpit-intelligence';

export type ForecastSummaryCardProps = {
  plan: RecoveryPlan;
};

export const ForecastSummaryCard: FC<ForecastSummaryCardProps> = ({ plan }) => {
  const aggressive = buildPlanForecast(plan, 'aggressive');
  const balanced = buildPlanForecast(plan, 'balanced');
  const conservative = buildPlanForecast(plan, 'conservative');

  const envelope = {
    aggressive: buildForecastEnvelope(aggressive),
    balanced: buildForecastEnvelope(balanced),
    conservative: buildForecastEnvelope(conservative),
  };

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Forecast comparison</h3>
      <table>
        <thead>
          <tr>
            <th>Mode</th>
            <th>Min</th>
            <th>Median</th>
            <th>Max</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Aggressive</td>
            <td>{envelope.aggressive.min.toFixed(1)}</td>
            <td>{envelope.aggressive.median.toFixed(1)}</td>
            <td>{envelope.aggressive.max.toFixed(1)}</td>
            <td>{envelope.aggressive.trend}</td>
          </tr>
          <tr>
            <td>Balanced</td>
            <td>{envelope.balanced.min.toFixed(1)}</td>
            <td>{envelope.balanced.median.toFixed(1)}</td>
            <td>{envelope.balanced.max.toFixed(1)}</td>
            <td>{envelope.balanced.trend}</td>
          </tr>
          <tr>
            <td>Conservative</td>
            <td>{envelope.conservative.min.toFixed(1)}</td>
            <td>{envelope.conservative.median.toFixed(1)}</td>
            <td>{envelope.conservative.max.toFixed(1)}</td>
            <td>{envelope.conservative.trend}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
};
