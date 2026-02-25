import { type ReactElement } from 'react';
import {
  type ChronicleGraphPolicy,
  collectPolicyDigest,
} from '@domain/recovery-chronicle-graph-core';
import { type GraphWorkspaceState } from '@service/recovery-chronicle-graph-orchestrator';

export interface ChronicleGraphAnalyticsPanelProps {
  readonly states: readonly GraphWorkspaceState[];
  readonly policy: ChronicleGraphPolicy;
}

const policyLabel = (policy: ChronicleGraphPolicy): string => `${policy.mode}-${policy.weight}`;

export const ChronicleGraphAnalyticsPanel = ({ states, policy }: ChronicleGraphAnalyticsPanelProps): ReactElement => {
  const score = states.reduce((acc, state) => acc + state.score, 0);
  const signature = collectPolicyDigest(policy);
  const avg = states.length === 0 ? 0 : Math.round(score / states.length);
  const maxPhaseCount = states.reduce((acc, state) => Math.max(acc, state.phaseCount), 0);

  return (
    <section>
      <h3>Policy + Metrics</h3>
      <p>Policy: {policyLabel(policy)}</p>
      <p>Signature: {signature}</p>
      <p>Aggregate Score: {avg}</p>
      <p>Max phase count: {maxPhaseCount}</p>
      <ul>
        {states.map((state) => (
          <li key={state.runId}>
            {state.runId} | phases: {state.phases.length} | plugins: {state.pluginCount} | route: {state.route}
          </li>
        ))}
      </ul>
    </section>
  );
};
