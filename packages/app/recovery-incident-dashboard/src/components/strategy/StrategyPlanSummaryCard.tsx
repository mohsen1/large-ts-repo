import { useMemo } from 'react';
import type { OrchestrationWorkspace } from '@service/recovery-strategy-orchestrator';
import { useStrategyPlanner } from '../../hooks/useStrategyPlanner';

interface StrategyPlanSummaryCardProps {
  readonly workspace: OrchestrationWorkspace;
  readonly className?: string;
}

export const StrategyPlanSummaryCard = ({ workspace, className }: StrategyPlanSummaryCardProps) => {
  const planner = useStrategyPlanner(workspace.template);

  const scoreDensity = useMemo(() => {
    if (workspace.windows.length === 0) {
      return 0;
    }

    const maxSignal = workspace.windows.reduce((sum, window) => sum + window.signalDensity, 0);
    return maxSignal / workspace.windows.length;
  }, [workspace.windows]);

  return (
    <section className={className ?? 'strategy-summary-card'}>
      <header>
        <h3>Strategy summary</h3>
        <p>{workspace.template.name}</p>
      </header>

      <ul>
        <li>owner: {workspace.draft.owner}</li>
        <li>planId: {workspace.plan.strategyId}</li>
        <li>runId: {workspace.run.runId}</li>
        <li>runbook commands: {workspace.plan.runbookTokens.length}</li>
        <li>runbook windows: {workspace.windows.length}</li>
        <li>command density: {scoreDensity.toFixed(3)}</li>
      </ul>

      <div>
        <div>Targets: {planner.totalTargets}</div>
        <div>Average criticality: {planner.criticalityAvg.toFixed(2)}</div>
        <div>Can parallelize: {planner.canRunInParallel ? 'yes' : 'no'}</div>
      </div>

      <div>
        <h4>Phase distribution</h4>
        <ul>
          <li>inbound: {planner.phaseDistribution.inbound}</li>
          <li>simulation: {planner.phaseDistribution.simulation}</li>
          <li>release: {planner.phaseDistribution.release}</li>
          <li>validation: {planner.phaseDistribution.validation}</li>
          <li>postmortem: {planner.phaseDistribution.postmortem}</li>
        </ul>
      </div>
    </section>
  );
};
