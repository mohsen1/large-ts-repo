import type { OrchestrationLab, OrchestrationPolicy } from '@domain/recovery-ops-orchestration-lab';
import { useMemo } from 'react';

interface RecoveryOpsPolicyMatrixProps {
  readonly lab: OrchestrationLab;
  readonly policy: OrchestrationPolicy;
  readonly selectedPlanId?: string;
}

interface MatrixCell {
  readonly policy: string;
  readonly signalCount: number;
  readonly planCount: number;
  readonly confidenceScore: number;
}

const buildCellLabel = (policy: OrchestrationPolicy, lab: OrchestrationLab): string =>
  `${policy.id}#${lab.id.slice(0, 8)}`;

const buildCells = (policy: OrchestrationPolicy, lab: OrchestrationLab): MatrixCell[] => {
  const signalDensity = lab.signals.length / Math.max(1, lab.plans.length + 1);
  const confidenceScore = (signalDensity * 0.5) + lab.plans.reduce((acc, plan) => acc + plan.confidence, 0) / Math.max(1, lab.plans.length);

  return [
    {
      policy: buildCellLabel(policy, lab),
      signalCount: lab.signals.length,
      planCount: lab.plans.length,
      confidenceScore,
    },
    {
      policy: `${policy.id}:parallel`,
      signalCount: lab.signals.filter((entry) => entry.tier === 'critical').length,
      planCount: policy.maxParallelSteps,
      confidenceScore: policy.minConfidence,
    },
    {
      policy: `${policy.id}:timeouts`,
      signalCount: policy.allowedTiers.length,
      planCount: policy.minWindowMinutes,
      confidenceScore: policy.timeoutMinutes / 100,
    },
  ];
};

export const RecoveryOpsPolicyMatrix = ({ lab, policy, selectedPlanId }: RecoveryOpsPolicyMatrixProps) => {
  const cells = useMemo(() => buildCells(policy, lab), [policy, lab]);

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h4>Policy matrix</h4>
      <table>
        <thead>
          <tr>
            <th>Policy</th>
            <th>Signals</th>
            <th>Plans / Window</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((cell) => (
            <tr key={cell.policy}>
              <td>{cell.policy}</td>
              <td>{cell.signalCount}</td>
              <td>{cell.planCount}</td>
              <td>{cell.confidenceScore.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{`selected=${selectedPlanId ?? 'none'}`}</p>
    </section>
  );
};
