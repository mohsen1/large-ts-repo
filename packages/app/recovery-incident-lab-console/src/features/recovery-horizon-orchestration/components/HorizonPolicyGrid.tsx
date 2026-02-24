import { type ReactElement } from 'react';
import type { WindowTrend } from '../types';

interface PolicyPolicy {
  readonly policyId: string;
  readonly stage: string;
  readonly status: 'ok' | 'warn' | 'fail';
  readonly impact: number;
  readonly tags: readonly string[];
}

interface HorizonPolicyGridProps {
  readonly policies: readonly PolicyPolicy[];
  readonly trend: readonly WindowTrend[];
  readonly onToggle: (policyId: string) => void;
  readonly onAcknowledge: (policyId: string) => void;
}

const policyState = (status: PolicyPolicy['status'], impact: number): string => {
  if (status === 'fail') {
    return `policy ${impact <= 10 ? 'critical' : 'hard'}`;
  }
  if (status === 'warn') {
    return `policy ${impact <= 5 ? 'medium' : 'soft'}`;
  }
  return 'policy ok';
};

const formatImpact = (value: number): string => `${value.toFixed(2)}%`;

const sortPolicies = (entries: readonly PolicyPolicy[]): readonly PolicyPolicy[] =>
  [...entries].sort((a, b) => b.impact - a.impact);

export const HorizonPolicyGrid = ({ policies, trend, onToggle, onAcknowledge }: HorizonPolicyGridProps): ReactElement => {
  const policiesByStatus = policies.reduce<Record<PolicyPolicy['status'], PolicyPolicy[]>>(
    (acc, policy) => {
      acc[policy.status] = [...(acc[policy.status] ?? []), policy];
      return acc;
    },
    { ok: [], warn: [], fail: [] },
  );

  const sorted = sortPolicies(policies);

  return (
    <section className="horizon-policy-grid">
      <header>
        <h2>Policy Control Plane</h2>
      </header>
      <aside>
        <h3>Trend Pressure</h3>
        <ul>
          {trend.map((entry) => (
            <li key={entry.stage}>
              {entry.stage}: {formatImpact(entry.ratio * 100)} · count {entry.count}
            </li>
          ))}
        </ul>
      </aside>
      <article>
        <h3>Policy Grid</h3>
        <ul>
          {sorted.map((entry) => (
            <li key={entry.policyId} className={policyState(entry.status, entry.impact)}>
              <div>
                <strong>{entry.policyId}</strong>
                <span>{entry.stage}</span>
              </div>
              <div>
                <span>{entry.status}</span>
                <span>{formatImpact(entry.impact)}</span>
              </div>
              <div>
                <button type="button" onClick={() => onToggle(entry.policyId)}>
                  Toggle
                </button>
                <button type="button" onClick={() => onAcknowledge(entry.policyId)}>
                  Ack
                </button>
              </div>
              <div>
                {(entry.tags ?? []).map((tag) => (
                  <code key={`${entry.policyId}-${tag}`}>
                    {tag}
                  </code>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </article>
      <footer>
        <p>OK: {policiesByStatus.ok.length}</p>
        <p>Warn: {policiesByStatus.warn.length}</p>
        <p>Fail: {policiesByStatus.fail.length}</p>
      </footer>
    </section>
  );
};
