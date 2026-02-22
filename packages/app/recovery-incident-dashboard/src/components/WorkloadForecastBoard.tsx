import { useMemo } from 'react';
import type { WorkloadNodeRow } from '../hooks/useWorkloadForecast';
import type { ForecastPlan } from '@service/recovery-workload-orchestrator';

export interface WorkloadForecastBoardProps {
  readonly rows: readonly WorkloadNodeRow[];
  readonly plans: readonly ForecastPlan[];
  readonly onRun: (incidentId: string) => Promise<string | undefined>;
  readonly isBusy: boolean;
}

export const WorkloadForecastBoard = ({ rows, plans, onRun, isBusy }: WorkloadForecastBoardProps) => {
  const riskCounts = useMemo(() => {
    const map = {
      ok: 0,
      warning: 0,
      critical: 0,
    };

    for (const row of rows) {
      map[row.state] += 1;
    }

    return map;
  }, [rows]);

  const topPlans = useMemo(() => plans.slice(0, 4), [plans]);

  return (
    <section className="workload-forecast-board">
      <header>
        <h2>Workload Forecast Board</h2>
        <p>Healthy: {riskCounts.ok} warning: {riskCounts.warning} critical: {riskCounts.critical}</p>
      </header>

      <ul className="workload-forecast-list">
        {rows.map((row) => (
          <li key={row.id} className={row.state}>
            <div>
              <strong>{row.name}</strong>
              <span>{Math.round(row.risk * 100)}% risk</span>
            </div>
            <div>
              <button
                type="button"
                onClick={() => {
                  void onRun(row.id);
                }}
                disabled={isBusy}
              >
                {isBusy ? 'Running' : 'Evaluate Plan'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <h3>Prioritized Plan Suggestions</h3>
      <ol>
        {topPlans.map((plan) => (
          <li key={`${plan.plan.node.id}-${plan.plan.windowKey}`}>
            <strong>{plan.plan.node.name}</strong>
            <p>{plan.recommendation}</p>
          </li>
        ))}
      </ol>
    </section>
  );
};
