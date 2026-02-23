import { useMemo } from 'react';
import type { ForgePolicyResult } from '@domain/recovery-command-forge';

interface Props {
  readonly policy: ForgePolicyResult;
  readonly showDetails: boolean;
}

const toPercent = (value: number): string => `${value.toFixed(2)}%`;

export const CommandForgePolicyPanel = ({ policy, showDetails }: Props) => {
  const summary = useMemo(
    () => ({
      riskScore: policy.riskScore,
      gatePassRate: policy.gates.reduce((acc, gate) => acc + (gate.passRate >= gate.threshold ? 1 : 0), 0) / policy.gates.length,
      topGateName: policy.gates.reduce((acc, gate) => {
        if (gate.passRate < acc.passRate) {
          return acc;
        }
        return gate;
      }, policy.gates[0] ?? { name: 'none', passRate: 0, threshold: 0, details: '', gateId: policy.planId }),
      lowestGate: policy.gates.reduce((acc, gate) => {
        if (acc.passRate < gate.passRate) {
          return acc;
        }
        return gate;
      }, policy.gates[0] ?? { name: 'none', passRate: 0, threshold: 0, details: '', gateId: policy.planId }),
    }),
    [policy],
  );

  return (
    <section className="command-forge-policy-panel">
      <h2>Policy summary</h2>
      <p>{policy.summary}</p>
      <p>{`urgency=${policy.urgency}, pass=${policy.pass ? 'yes' : 'no'}`}</p>
      <p>{`risk=${summary.riskScore}`}</p>
      <p>{`gate pass ${toPercent(summary.gatePassRate * 100)}`}</p>
      <p>{`top gate ${summary.topGateName.name}`}</p>
      <p>{`lowest gate ${summary.lowestGate.name}`}</p>
      {showDetails ? (
        <ul>
          {policy.gates.map((gate) => (
            <li key={gate.gateId}>{`${gate.name}: ${gate.passRate.toFixed(2)} / ${gate.threshold.toFixed(2)} -> ${gate.passRate >= gate.threshold ? 'ok' : 'warn'}`}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
