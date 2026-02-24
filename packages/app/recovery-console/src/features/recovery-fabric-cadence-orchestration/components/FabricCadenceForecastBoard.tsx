import type { CadenceForecast, CadencePlan } from '@domain/recovery-fabric-cadence-core';

type CadenceForecastBoardProps = {
  readonly forecasts: readonly CadenceForecast[];
  readonly activePlan?: CadencePlan;
};

export const FabricCadenceForecastBoard = ({ forecasts, activePlan }: CadenceForecastBoardProps) => {
  return (
    <section style={{ padding: 12, border: '1px solid #243248', borderRadius: 12, marginBottom: 12 }}>
      <h3 style={{ margin: '0 0 8px 0' }}>Forecast board</h3>
      {activePlan ? (
        <p style={{ margin: 0 }}>{`active plan windows=${activePlan.windows.length} mode=${activePlan.metadata.mode}`}</p>
      ) : (
        <p style={{ margin: 0 }}>No active plan selected.</p>
      )}

      <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #334' }}>Plan</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #334' }}>Trend</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #334' }}>Duration</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #334' }}>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {forecasts.map((forecast) => (
            <tr key={forecast.planId}>
              <td>{forecast.planId}</td>
              <td>{forecast.trend}</td>
              <td>{forecast.expectedDurationMs}</td>
              <td>{forecast.confidence.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul style={{ marginTop: 10 }}>
        {activePlan
          ? activePlan.nodeOrder.map((nodeId, index) => <li key={`${nodeId}-${index}`}>{`${index + 1}: ${nodeId}`}</li>)
          : <li>Plan nodes will appear once forecast exists.</li>}
      </ul>
    </section>
  );
};
