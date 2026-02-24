import type { SagaPolicy } from '@domain/recovery-incident-saga';
import type { ReactElement } from 'react';

interface Props {
  readonly policy?: SagaPolicy;
}

const severityStyle = (weight: number): 'high' | 'mid' | 'low' =>
  weight > 60 ? 'high' : weight > 30 ? 'mid' : 'low';

export const SagaPolicyTable = ({ policy }: Props): ReactElement => {
  if (!policy) {
    return <section>Policy data missing.</section>;
  }

  return (
    <section className="saga-policy-table">
      <h3>Policy: {policy.name}</h3>
      <p>Confidence {policy.confidence.toFixed(2)}</p>
      <p>Threshold {policy.threshold.toFixed(2)}</p>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Command</th>
            <th>Weight</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {policy.steps
            .toSorted((left, right) => right.weight - left.weight)
            .map((step) => (
              <tr key={step.id} data-severity={severityStyle(step.weight)}>
                <td>{step.title}</td>
                <td>{step.command}</td>
                <td>{step.weight}</td>
                <td>{step.actionType}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
};
