import { useMemo } from 'react';
import { buildBatchFromSimulation, runWorkspaceWithBudgetSweep, buildBatchSummary } from '@service/recovery-command-forge-orchestrator';
import type { ForgeScenario } from '@domain/recovery-command-forge';
import { buildExecutionReport } from '@domain/recovery-command-forge';

interface Props {
  readonly tenant: string;
  readonly scenarios: readonly ForgeScenario[];
}

export const RecoveryCommandForgeMetricsPage = ({ tenant, scenarios }: Props) => {
  const sweep = useMemo(
    () => scenarios.flatMap((scenario) => runWorkspaceWithBudgetSweep(tenant, scenario, [15, 30, 45, 60])),
    [tenant, scenarios],
  );

  const simulation = useMemo(() => buildBatchFromSimulation(tenant, scenarios), [tenant, scenarios]);
  const reports = useMemo(() => scenarios.map((scenario) => buildExecutionReport(tenant, scenario)), [tenant, scenarios]);
  const grouped = useMemo(
    () => scenarios.map((scenario) => ({
      scenario,
      runs: runWorkspaceWithBudgetSweep(tenant, scenario, [15, 30, 45, 60]),
    })),
    [tenant, scenarios],
  );

  const summary = useMemo(() => {
    const batchSummary = buildBatchSummary({
      tenant,
      generatedAt: new Date().toISOString(),
      groups: grouped,
    });

    const avg = sweep.length ? Math.round(sweep.reduce((acc, entry) => acc + entry.policyScore, 0) / sweep.length) : 0;
    const best = sweep.length ? Math.max(...sweep.map((entry) => entry.policyScore)) : 0;
    const worst = sweep.length ? Math.min(...sweep.map((entry) => entry.policyScore)) : 0;

    return {
      ...batchSummary,
      avg,
      best,
      worst,
      reportsCount: reports.length,
    };
  }, [grouped, simulation, sweep, tenant, reports.length]);

  return (
    <section>
      <h2>Recovery Command Forge metrics</h2>
      <p>{`tenant=${tenant}`}</p>
      <p>{`runs=${summary.totalRuns}`}</p>
      <p>{`success=${summary.successfulRuns} fail=${summary.failedRuns}`}</p>
      <p>{`avg=${summary.avg}`}</p>
      <p>{`best=${summary.best}`}</p>
      <p>{`worst=${summary.worst}`}</p>
      <p>{`reportCount=${summary.reportsCount}`}</p>
      <ul>
        {simulation.map((entry) => (
          <li key={entry.runId}>{`${entry.runId}: score=${entry.policyScore}`}</li>
        ))}
      </ul>
    </section>
  );
};
