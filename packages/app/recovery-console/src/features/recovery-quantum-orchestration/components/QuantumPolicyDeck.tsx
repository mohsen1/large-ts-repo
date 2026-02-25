import { useMemo } from 'react';
import type { QuantumPolicy } from '@domain/recovery-quantum-orchestration';
import { rankPolicies } from '@domain/recovery-quantum-orchestration';

const formatScore = (value: number) => value.toFixed(3);

interface Props {
  readonly policies: readonly QuantumPolicy[];
}

interface PolicyLine {
  readonly title: string;
  readonly score: number;
}

const policyLine = (policy: QuantumPolicy): PolicyLine => ({
  title: `${policy.title} (${policy.scope.length})`,
  score: policy.weight * 2.5,
});

export const QuantumPolicyDeck = ({ policies }: Props) => {
  const ranked = useMemo(() => rankPolicies(policies), [policies]);
  const average = useMemo(
    () =>
      ranked.length > 0
        ? ranked.reduce((acc, policy) => acc + policy.weight, 0) / ranked.length
        : 0,
    [ranked],
  );
  const lines = useMemo(() => ranked.map(policyLine), [ranked]);
  const topPolicy = lines[0];

  return (
    <section className="quantum-policy-deck">
      <header>
        <h3>Policy deck</h3>
        <p>Policies: {policies.length}</p>
        <p>Average weight: {average.toFixed(2)}</p>
      </header>
      {topPolicy ? <p>Top policy: {topPolicy.title}</p> : <p>No policies</p>}
      <ul>
        {lines.map((line, index) => (
          <li key={`${line.title}-${index}`}>
            {line.title} — {formatScore(line.score)}
          </li>
        ))}
      </ul>
    </section>
  );
};
