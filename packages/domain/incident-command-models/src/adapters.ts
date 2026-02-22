import type { CommandDefinition, RecoveryCommand, CommandPlan, SimulationResult, SimulatedImpact, CommandCoverageReport, TimelineBucket } from './types';
import { topSaturation } from './timeline';

export interface CommandEnvelope {
  tenantId: string;
  receivedAt: string;
  command: RecoveryCommand;
}

export interface PlanExport {
  planId: string;
  tenantId: string;
  commands: readonly string[];
  totals: {
    totalRisk: number;
    coverage: number;
    blockedReasons: readonly string[];
  };
}

export const toCommandEnvelope = (tenantId: string, command: RecoveryCommand): CommandEnvelope => ({
  tenantId,
  receivedAt: new Date().toISOString(),
  command,
});

export const asRecoveryCommand = (input: CommandDefinition): RecoveryCommand => ({
  ...input,
  runbook: ['validate preconditions', 'stage traffic', 'run checks', 'rollback guard'],
  runMode: 'canary',
  retryWindowMinutes: 25,
});

export const commandIdsFromPlan = (plan: CommandPlan): readonly string[] => plan.steps.map((step) => step.commandId);

export const commandPlanToExport = (plan: CommandPlan): PlanExport => ({
  planId: plan.id,
  tenantId: plan.tenantId,
  commands: [...commandIdsFromPlan(plan)],
  totals: {
    totalRisk: plan.totalRisk,
    coverage: plan.coverage,
    blockedReasons: plan.blockedReasons,
  },
});

export const simulationImpactByWindow = (result: SimulationResult, buckets: readonly TimelineBucket[]): SimulatedImpact[] => {
  return result.impacts.map((impact) => ({
    ...impact,
    blockers: [...impact.blockers, `${buckets.length} window-buckets analyzed`],
  }));
};

export const planCoverageToReport = (
  plan: CommandPlan,
  buckets: readonly TimelineBucket[],
): CommandCoverageReport => ({
  totalResources: [
    {
      resource: 'compute',
      required: Math.max(1, Math.floor(plan.totalRisk / 10)),
      coveredByPlan: Math.max(0, Math.floor(plan.coverage / 5)),
    },
    {
      resource: 'network',
      required: Math.max(1, Math.floor(plan.coverage / 4)),
      coveredByPlan: Math.max(
        0,
        Math.floor(topSaturation([{ windowId: 'window:aggregate' as never, buckets }], 10).length),
      ),
    },
  ],
  commandCount: plan.steps.length,
  medianRisk: plan.steps.length > 0
    ? [...plan.steps]
        .map((step) => step.rationale.length)
        .sort((left, right) => left - right)[Math.floor(plan.steps.length / 2)]
    : 0,
});
