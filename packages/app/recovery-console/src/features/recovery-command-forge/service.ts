import { buildExecutionReport } from '@domain/recovery-command-forge';
import type { ForgeScenario } from '@domain/recovery-command-forge';
import { useMemo } from 'react';

export interface ForgeServiceFacadeResult {
  readonly policySummary: string;
  readonly planNodes: number;
  readonly topologies: number;
}

export const useForgeServiceFacade = (tenant: string, scenarios: readonly ForgeScenario[]): ForgeServiceFacadeResult => {
  const summary = useMemo(() => {
    if (!scenarios.length) {
      return 'no scenarios';
    }

    const report = buildExecutionReport(
      tenant,
      scenarios[0]!,
      {
        defaultUrgency: 'urgent',
        maxBudgetMinutes: scenarios[0].budget.maxDurationMinutes,
        minConfidence: 50,
        policyGateEnabled: true,
      },
    );

    const summary = report.policy.pass ? `policy pass: ${report.policy.summary}` : `policy blocked: ${report.policy.summary}`;
    return `${summary} // nodes=${report.topologies.reduce((acc, topology) => acc + topology.nodes.length, 0)} // topologies=${report.topologies.length}`;
  }, [tenant, scenarios]);

  const planNodes = scenarios[0]?.planSnapshot.constraints.maxParallelism ?? 0;
  const topologies = scenarios[0] ? scenarios[0].signals.length : 0;

  return {
    policySummary: `${tenant}: ${summary}`,
    planNodes,
    topologies,
  };
};
