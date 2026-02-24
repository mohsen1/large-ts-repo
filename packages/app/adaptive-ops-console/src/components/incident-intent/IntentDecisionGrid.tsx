import { useMemo } from 'react';
import { type IncidentIntentStepOutput, type IncidentIntentPolicy } from '@domain/recovery-incident-intent';

interface IntentDecisionGridProps {
  readonly policies: readonly IncidentIntentPolicy[];
  readonly outputs: readonly IncidentIntentStepOutput[];
}

const toWeight = (policy: IncidentIntentPolicy): number =>
  policy.weight.severity + policy.weight.confidence + policy.weight.freshness + policy.weight.cost;

export const IntentDecisionGrid = ({ policies, outputs }: IntentDecisionGridProps) => {
  const sortedPolicies = useMemo(() => {
    return [...policies]
      .toSorted((left, right) => toWeight(right) - toWeight(left))
      .map((policy) => ({
        policy,
        weight: toWeight(policy),
      }));
  }, [policies]);

  return (
    <section>
      <h3>Policy Decisions</h3>
      <table>
        <thead>
          <tr>
            <th>Policy</th>
            <th>Confidence</th>
            <th>Weights</th>
            <th>Signal Output</th>
          </tr>
        </thead>
        <tbody>
          {sortedPolicies.map(({ policy, weight }, index) => {
            const output = outputs[index] ?? null;
            return (
              <tr key={policy.policyId}>
                <td>{policy.title}</td>
                <td>{policy.minimumConfidence.toFixed(2)}</td>
                <td>{weight.toFixed(2)}</td>
                <td>{output ? `${output.kind} / ${output.status}` : 'pending'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};
