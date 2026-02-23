import type { RecoverySimulationLabResult } from '@domain/recovery-simulation-lab-models';

interface SimulationLabReadinessBoardProps {
  readonly result?: RecoverySimulationLabResult;
  readonly selected?: string;
  readonly riskHeadline?: string;
  readonly onSelectBand: (band: string) => void;
}

export const SimulationLabReadinessBoard = ({
  result,
  selected,
  riskHeadline,
  onSelectBand,
}: SimulationLabReadinessBoardProps) => {
  if (!result) {
    return (
      <section>
        <h2>Readiness board</h2>
        <p>No readiness plan has been built yet.</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Readiness board</h2>
      <p>{`Projected band: ${result.projection.band}`}</p>
      <p>{`Expected recovery: ${result.estimate.expectedRecoveryMinutes}m`}</p>
      <p>{`Residual risk: ${result.estimate.residualRisk.toFixed(3)}`}</p>
      <p>{`Recommendation: ${result.estimate.recommendation}`}</p>
      {riskHeadline && <p>{riskHeadline}</p>}
      <ul>
        {result.estimate.bandSignals.map((signal) => (
          <li key={`${signal.stepId}:${signal.band}`}>
            <button type="button" onClick={() => onSelectBand(signal.band)}>
              <strong style={{ fontWeight: signal.stepId === selected ? 'bold' : 'normal' }}>{signal.stepId}</strong>
            </button>
            <span>{` ${signal.band} ${signal.score.toFixed(2)} ${signal.rationale}`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
