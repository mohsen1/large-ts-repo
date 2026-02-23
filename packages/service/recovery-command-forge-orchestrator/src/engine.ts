import { withBrand } from '@shared/core';
import type { ForgeExecutionReport, ForgeRuntimeConfig, ForgeRunId, ForgeScenario } from '@domain/recovery-command-forge';
import { buildExecutionReport, simulateBatch, simulateByBudget } from '@domain/recovery-command-forge';
import { ok, fail, type Result } from '@shared/result';

export interface ForgeRunResult {
  readonly runId: ForgeRunId;
  readonly tenant: string;
  readonly policyScore: number;
  readonly policyPass: boolean;
  readonly constraints: number;
  readonly summary: string;
  readonly budgetWindowMinutes: number;
}

export interface ForgeScenarioWorkspace {
  readonly scenario: ForgeScenario;
  readonly runs: readonly ForgeRunResult[];
}

export interface ForgeOrchestrationBatch {
  readonly tenant: string;
  readonly generatedAt: string;
  readonly groups: readonly ForgeScenarioWorkspace[];
}

const summarizeRun = (tenant: string, index: number, report: ForgeExecutionReport, budgetWindowMinutes: number): ForgeRunResult => ({
  runId: withBrand(
    report.topologies[0]?.planId ? String(report.topologies[0].planId) : `run-${tenant}-${index}`,
    'RecoveryForgeRunId',
  ),
  tenant,
  policyScore: report.policy.riskScore,
  policyPass: report.policy.pass,
  constraints: report.outcomes.length,
  summary: `${report.policy.urgency}:${report.policy.summary}`,
  budgetWindowMinutes,
});

export const runScenario = (tenant: string, scenario: ForgeScenario, runtime: Partial<ForgeRuntimeConfig>): ForgeRunResult => {
  const report = buildExecutionReport(tenant, scenario, runtime);
  return summarizeRun(tenant, 0, report, scenario.budget.maxDurationMinutes);
};

export const runWorkspace = (
  tenant: string,
  scenarios: readonly ForgeScenario[],
  runtime: Partial<ForgeRuntimeConfig>,
): Result<ForgeOrchestrationBatch> => {
  if (scenarios.length === 0) {
    return fail(new Error('No scenarios provided'), 'FORGE_NO_SCENARIOS');
  }

  const groups = scenarios.map((scenario, index) => ({
    scenario,
    runs: [runScenario(tenant, scenario, runtime)],
  }));

  return ok({
    tenant,
    generatedAt: new Date().toISOString(),
    groups,
  });
};

export const runWorkspaceWithBudgetSweep = (
  tenant: string,
  scenario: ForgeScenario,
  budgets: readonly number[],
): readonly ForgeRunResult[] => {
  return budgets.map((budget, index) => {
    const report = buildExecutionReport(tenant, scenario, {
      maxBudgetMinutes: budget,
      policyGateEnabled: true,
    });
    return {
      runId: withBrand(`${tenant}-batch-${budget}`, 'RecoveryForgeRunId'),
      tenant,
      policyScore: report.policy.riskScore,
      policyPass: report.policy.pass,
      constraints: report.outcomes.length,
      summary: `sweep-${index}`,
      budgetWindowMinutes: budget,
    };
  });
};

export const buildBatchFromSimulation = (tenant: string, scenarios: readonly ForgeScenario[]): readonly ForgeRunResult[] =>
  simulateBatch(tenant, scenarios).runs.map((run, index) => ({
    runId: withBrand(
      run.report.topologies[0]?.planId ? String(run.report.topologies[0].planId) : `sim-${tenant}-${index}`,
      'RecoveryForgeRunId',
    ),
    tenant,
    policyScore: run.policyScore,
    policyPass: run.policyScore >= 50,
    constraints: run.report.outcomes.length,
    summary: `sim-${index}`,
    budgetWindowMinutes: run.report.outcomes[0]?.forecast.commandWindowMinutes
      ?? run.report.topologies.reduce((acc, topology) => acc + topology.nodes.length, 0),
  }));

export const summarizeBatch = (
  batch: ForgeOrchestrationBatch,
): { readonly successfulRuns: number; readonly failedRuns: number; readonly averagePolicyScore: number } => {
  const runs = batch.groups.flatMap((group) => group.runs);
  if (runs.length === 0) {
    return { successfulRuns: 0, failedRuns: 0, averagePolicyScore: 0 };
  }

  const successfulRuns = runs.filter((run) => run.policyPass).length;
  const averagePolicyScore = Math.round(
    runs.reduce((acc, run) => acc + run.policyScore, 0) / runs.length,
  );

  return {
    successfulRuns,
    failedRuns: runs.length - successfulRuns,
    averagePolicyScore,
  };
};

export const buildOrchestratedBatch = (tenant: string, scenarios: readonly ForgeScenario[]): ForgeOrchestrationBatch => {
  const groups = scenarios.map((scenario) => ({
    scenario,
    runs: runWorkspaceWithBudgetSweep(tenant, scenario, [15, 30, 45, 60]),
  }));

  return {
    tenant,
    generatedAt: new Date().toISOString(),
    groups,
  };
};

export const buildBatchSummary = (batch: ForgeOrchestrationBatch) => {
  const runs = batch.groups.flatMap((group) => group.runs);
  return {
    totalRuns: runs.length,
    successfulRuns: runs.filter((run) => run.policyPass).length,
    failedRuns: runs.filter((run) => !run.policyPass).length,
    average: runs.length ? Math.round(runs.reduce((acc, run) => acc + run.policyScore, 0) / runs.length) : 0,
  };
};
