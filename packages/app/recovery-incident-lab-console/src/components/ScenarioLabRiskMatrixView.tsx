import { type ReactElement } from 'react';
import type { PlanRiskScore } from '@domain/recovery-incident-lab-core';

interface Props {
  readonly title: string;
  readonly risks: readonly PlanRiskScore[];
}

const riskTone = (score: number): string => {
  if (score >= 80) {
    return 'critical';
  }
  if (score >= 60) {
    return 'warning';
  }
  if (score >= 30) {
    return 'elevated';
  }
  return 'ok';
};

const sortByScore = (risks: readonly PlanRiskScore[]): readonly PlanRiskScore[] =>
  [...risks].sort((left, right) => right.score - left.score);

export const ScenarioLabRiskMatrixView = ({ title, risks }: Props): ReactElement => {
  const sorted = sortByScore(risks);
  return (
    <section className="scenario-lab-risk-matrix">
      <header>
        <h2>{title}</h2>
      </header>
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Severity</th>
            <th>Score</th>
            <th>Band</th>
            <th>Bands</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((risk) => (
            <tr key={risk.scenarioId}>
              <td>{risk.scenarioId}</td>
              <td>{risk.severity}</td>
              <td>{risk.score}</td>
              <td>{riskTone(risk.score)}</td>
              <td>
                <ul>
                  {risk.bands.map((band, index) => (
                    <li key={`${risk.scenarioId}-${band.signal}-${index}`}>
                      {band.signal}={band.value} {band.note}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
