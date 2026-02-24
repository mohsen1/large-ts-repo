import { useMemo, type ReactElement } from 'react';
import type { PluginStage } from '@domain/recovery-horizon-engine';
import type { HorizonSignal } from '@domain/recovery-horizon-engine';

interface DecisionCell {
  readonly stage: PluginStage;
  readonly decision: 'allow' | 'block' | 'review';
  readonly confidence: number;
}

interface PolicyBundle {
  readonly policy: string;
  readonly cells: readonly DecisionCell[];
}

interface PolicyDecision {
  readonly policy: string;
  readonly stage: PluginStage;
  readonly score: number;
  readonly reason: string;
}

interface Props {
  readonly policies: readonly PolicyBundle[];
  readonly signals: readonly HorizonSignal<PluginStage, unknown>[];
  readonly onReject: (stage: PluginStage, reason: string) => void;
  readonly onApprove: (policy: string) => void;
}

const label = (decision: DecisionCell['decision']) => {
  if (decision === 'allow') {
    return 'Allow';
  }
  if (decision === 'block') {
    return 'Block';
  }
  return 'Review';
};

const decisionScore = (score: number): string => `${score}%`;

const cellClass = (decision: DecisionCell['decision']) =>
  decision === 'allow' ? 'policy-allow' : decision === 'block' ? 'policy-block' : 'policy-review';

const collectDecisions = (policies: readonly PolicyBundle[]) =>
  policies.flatMap((bundle) =>
    bundle.cells.map((cell) => ({
      policy: bundle.policy,
      stage: cell.stage,
      score: cell.confidence,
      reason: `${label(cell.decision)} (${cell.confidence})`,
    })),
  );

const policyDecisionMap = (decisions: readonly PolicyDecision[]): Map<string, PolicyDecision[]> => {
  const grouped = new Map<string, PolicyDecision[]>();
  for (const entry of decisions) {
    const bucket = grouped.get(entry.policy) ?? [];
    grouped.set(entry.policy, [...bucket, entry]);
  }
  return grouped;
};

export const HorizonPolicyMatrix = ({ policies, signals, onReject, onApprove }: Props): ReactElement => {
  const decisions = useMemo(() => collectDecisions(policies), [policies]);
  const map = useMemo(() => policyDecisionMap(decisions), [decisions]);
  const uniqueSignals = useMemo(() => new Set(signals.map((entry) => entry.kind)), [signals]);

  return (
    <section className="horizon-policy-matrix">
      <h2>Policy Matrix</h2>
      <p>{`signals observed: ${uniqueSignals.size}`}</p>
      {Array.from(map.entries()).map(([policy, bucket]) => {
        const sorted = [...bucket].sort((left, right) => right.score - left.score);
        return (
          <article key={policy} className="policy-card">
            <h3>{policy}</h3>
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Decision</th>
                  <th>Score</th>
                  <th>Reason</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry, rowIndex) => {
                  const stageDecision = policies
                    .find((item) => item.policy === policy)
                    ?.cells.find((cell) => cell.stage === entry.stage)?.decision ?? 'review';
                  return (
                    <tr key={`${policy}-${entry.stage}-${rowIndex}`}>
                      <td>{entry.stage}</td>
                      <td className={cellClass(stageDecision)}>{label(stageDecision)}</td>
                      <td>{decisionScore(entry.score)}</td>
                      <td>{entry.reason}</td>
                      <td>
                        {stageDecision === 'block' ? (
                          <button
                            type="button"
                            onClick={() => onReject(entry.stage, `${policy} :: ${entry.reason}`)}
                          >
                            Reject
                          </button>
                        ) : (
                          <button type="button" onClick={() => onApprove(policy)}>
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </article>
        );
      })}
    </section>
  );
};
