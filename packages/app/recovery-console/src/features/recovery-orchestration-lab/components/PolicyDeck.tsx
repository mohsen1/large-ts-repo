import { memo, type ReactElement, useMemo } from 'react';
import type { OrchestrationPlanOutput } from '../domain/models';

export interface PolicyDeckPolicy {
  readonly name: string;
  readonly controls: readonly {
    service: string;
    action: string;
    priority: number;
  }[];
}

export interface PolicyDeckProps {
  readonly title: string;
  readonly output: OrchestrationPlanOutput;
  readonly selectedPolicies?: readonly string[];
  readonly onSelect?: (policyName: string) => void;
}

const scored = (policies: readonly PolicyDeckPolicy[]) =>
  policies
    .map((entry) => ({
      ...entry,
      score: entry.controls.reduce((acc, control) => acc + control.priority, 0) / Math.max(1, entry.controls.length),
    }))
    .sort((left, right) => right.score - left.score);

export const PolicyDeck = memo(function PolicyDeck(props: PolicyDeckProps): ReactElement {
  const mapped = useMemo(() => {
    const policies: readonly PolicyDeckPolicy[] = props.output.directives.map((entry) => ({
      name: entry.name,
      controls: entry.controls,
    }));
    return scored(policies);
  }, [props.output.directives]);

  return (
    <section className="policy-deck">
      <h2>{props.title}</h2>
      <p>{props.output.summary}</p>
      {mapped.length === 0 ? <p>No directives available</p> : null}
      <ul>
        {mapped.map((policy) => {
          const active = (props.selectedPolicies ?? []).includes(policy.name);
          return (
            <li key={policy.name}>
              <article
                className={active ? 'policy policy--selected' : 'policy'}
                onClick={() => props.onSelect?.(policy.name)}
              >
                <h3>{policy.name}</h3>
                <p>Score {policy.score.toFixed(4)}</p>
                <ul>
                  {policy.controls.map((control) => (
                    <li key={control.service}>
                      {control.service} : {control.action} ({control.priority})
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
