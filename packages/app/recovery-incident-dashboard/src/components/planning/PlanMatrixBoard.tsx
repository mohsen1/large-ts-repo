import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { PlanningLane } from '../../hooks/useRecoveryPlanningWorkspace';

interface PlanMatrixBoardProps {
  readonly title: string;
  readonly lanes: readonly PlanningLane[];
  readonly onSelectPlan: (planId: PlanningLane['planId']) => void;
}

const LaneBadge = ({ lane, onSelectPlan }: { lane: PlanningLane; onSelectPlan: (planId: PlanningLane['planId']) => void }): ReactNode => {
  const status = lane.riskScore > 0.7 ? 'critical' : lane.riskScore > 0.4 ? 'warning' : 'healthy';
  const toneClass = status === 'critical' ? 'status-critical' : status === 'warning' ? 'status-warning' : 'status-healthy';
  return (
    <li className="plan-matrix-row" key={lane.planId as string}>
      <button
        type="button"
        className={toneClass}
        onClick={() => onSelectPlan(lane.planId)}
      >
        {lane.incidentId}
      </button>
      <span>{lane.planId}</span>
      <span>risk: {lane.riskScore.toFixed(3)}</span>
      <span>runs: {lane.runCount}</span>
      <span>density: {lane.signalDensity.toFixed(2)}</span>
    </li>
  );
};

export const PlanMatrixBoard = ({ title, lanes, onSelectPlan }: PlanMatrixBoardProps) => {
  const sorted = useMemo(
    () => [...lanes].sort((left, right) => right.riskScore - left.riskScore),
    [lanes],
  );
  return (
    <section className="plan-matrix">
      <header>
        <h2>{title}</h2>
      </header>
      <ul className="plan-matrix-list">
        {sorted.length === 0 ? <li className="plan-matrix-empty">No lanes loaded</li> : null}
        {sorted.map((lane) => (
          <LaneBadge key={String(lane.planId)} lane={lane} onSelectPlan={onSelectPlan} />
        ))}
      </ul>
    </section>
  );
};
