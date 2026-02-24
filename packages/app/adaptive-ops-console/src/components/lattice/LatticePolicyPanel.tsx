import { useMemo, type ReactElement } from 'react';
import type { ConstraintTuple, ConstraintPolicy, NestedPath } from '@domain/recovery-lattice';

type PolicyDecision = 'allow' | 'observe' | 'deny';

export interface PolicyItem {
  readonly id: string;
  readonly policyName: string;
  readonly mode: PolicyDecision;
  readonly route: string;
  readonly score: number;
  readonly constraints: readonly ConstraintTuple[];
}

export interface PolicySignalRow {
  readonly policyId: string;
  readonly path: string;
  readonly value: string;
}

type PolicyPanelProps = {
  readonly title: string;
  readonly policies: readonly PolicyItem[];
  readonly onActivate: (policyId: string) => void;
  readonly onClear: () => void;
};

const colorForMode = (mode: PolicyDecision): string => {
  if (mode === 'allow') return '#4fe38d';
  if (mode === 'deny') return '#ff7474';
  return '#ffc54f';
};

const scoreClass = (score: number): string => {
  if (score > 0.75) return 'high';
  if (score > 0.35) return 'mid';
  return 'low';
};

const renderConstraint = (
  constraint: ConstraintTuple<`${string}.${string}` | string>,
  index: number,
): PolicySignalRow => {
  const policy = constraint[0];
  const rule = constraint[1];
  if (policy === 'allow') {
    return {
      policyId: `${index}`,
      path: rule.path,
      value: `${rule.operator}:${'value' in rule ? rule.value : rule.values.join(',')}`,
    };
  }
  if (policy === 'deny') {
    return {
      policyId: `${index}`,
      path: rule.path,
      value: `${rule.operator}:deny`,
    };
  }
  return {
    policyId: `${index}`,
    path: rule.path,
    value: `${rule.operator}:observe`,
  };
};

export const LatticePolicyPanel = ({
  title,
  policies,
  onActivate,
  onClear,
}: PolicyPanelProps): ReactElement => {
  const sorted = useMemo(
    () => [...policies].toSorted((left, right) => right.score - left.score),
    [policies],
  );

  return (
    <section className="lattice-policy-panel">
      <header>
        <h3>{title}</h3>
        <button type="button" onClick={onClear}>
          clear
        </button>
      </header>

      <ul className="policy-list">
        {sorted.map((policy) => {
          const rows = policy.constraints.map((constraint, index) => renderConstraint(constraint, index));
          return (
            <li
              key={policy.id}
              className={`policy-row ${scoreClass(policy.score)}`}
              style={{ borderLeftColor: colorForMode(policy.mode) }}
            >
              <button type="button" onClick={() => onActivate(policy.id)}>
                {policy.policyName}
              </button>
              <span className="policy-score">{policy.score.toFixed(2)}</span>
              <em>{policy.route}</em>
              <ul>
                {rows.map((row) => (
                  <li key={`${policy.id}-${row.path}`}>
                    <strong>{row.path}</strong> <small>{row.value}</small>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
        {sorted.length === 0 ? <li className="empty">No policy loaded</li> : null}
      </ul>
    </section>
  );
};

export type { ConstraintTuple, ConstraintPolicy, NestedPath };
