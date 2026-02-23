import type { ForgeExecutionReport, ForgeScenario, ForgeRuntimeConfig } from './types';
import { buildExecutionReport } from './planner';
import { summarizeCoverage } from './insights';
import { withBrand } from '@shared/core';

export interface SimulationRun {
  readonly report: ForgeExecutionReport;
  readonly coverage: number;
  readonly readinessScore: number;
  readonly policyScore: number;
}

export interface SimulationBatch {
  readonly tenant: string;
  readonly runCount: number;
  readonly bestRiskScore: number;
  readonly worstRiskScore: number;
  readonly runs: readonly SimulationRun[];
}

const normalizeScore = (value: number): number => Math.max(0, Math.min(100, value));

export const simulateBatch = (tenant: string, scenarios: readonly ForgeScenario[]): SimulationBatch => {
  if (scenarios.length === 0) {
    return {
      tenant,
      runCount: 0,
      bestRiskScore: 0,
      worstRiskScore: 0,
      runs: [],
    };
  }

  const runs = scenarios.map((scenario) => {
    const report = buildExecutionReport(tenant, scenario);
    const graph = {
      planId: report.topologies[0]?.planId ?? withBrand(`fallback-${tenant}`, 'RecoveryForgePlanId'),
      tenant,
      createdAt: report.generatedAt,
      nodes: report.topologies.flatMap((topology) => topology.nodes.map((node) => node.node)),
      edges: report.topologies.flatMap((topology) => {
        const nodeIds = topology.nodes.map((node) => node.node.id);
        return nodeIds.slice(1).map((targetId, index) => ({
          from: nodeIds[index] ?? targetId,
          to: targetId,
          dependencyStrength: 0.45,
          isOptional: index % 2 === 0,
        }));
      }),
    };

    return {
      report,
      coverage: summarizeCoverage(graph),
      readinessScore: scenario.slaProfile.windowMinutes,
      policyScore: report.policy.riskScore,
    };
  });

  const scores = runs.map((run) => run.policyScore);
  return {
    tenant,
    runCount: runs.length,
    bestRiskScore: normalizeScore(Math.max(...scores)),
    worstRiskScore: normalizeScore(Math.min(...scores)),
    runs,
  };
};

export const simulateByBudget = (tenant: string, scenario: ForgeScenario, budgets: readonly number[]): SimulationBatch => {
  const runs = budgets.map((limit) => {
    const report = buildExecutionReport(tenant, scenario, {
      defaultUrgency: limit < 30 ? 'critical' : limit < 90 ? 'urgent' : 'routine',
      maxBudgetMinutes: limit,
      minConfidence: 0,
      policyGateEnabled: true,
    });

    const coverage = Math.min(100, 20 + scenario.signals.length + limit / 2);

    return {
      report,
      coverage,
      readinessScore: Math.min(100, scenario.slaProfile.windowMinutes + limit / 10),
      policyScore: Math.round(Math.max(0, report.policy.riskScore - limit * 0.2)),
    };
  });

  const policyScores = runs.map((run) => run.policyScore);
  return {
    tenant,
    runCount: runs.length,
    bestRiskScore: Math.round(Math.max(...policyScores)),
    worstRiskScore: Math.round(Math.min(...policyScores)),
    runs,
  };
};

export const generateDefaultSimulation = (tenant: string, scenario: ForgeScenario): SimulationBatch => {
  const report = buildExecutionReport(tenant, scenario);
  return {
    tenant,
    runCount: 1,
    bestRiskScore: report.policy.riskScore,
    worstRiskScore: report.policy.riskScore,
    runs: [
      {
        report,
        coverage: summarizeCoverage({
          planId: report.topologies[0]?.planId ?? withBrand(`fallback-${tenant}`, 'RecoveryForgePlanId'),
          tenant,
          createdAt: report.generatedAt,
          nodes: report.topologies.flatMap((topology) => topology.nodes.map((node) => node.node)),
          edges: report.topologies.flatMap((topology) => {
            const nodes = topology.nodes.map((node) => node.node.id);
            return nodes.slice(1).map((id, index) => ({
              from: nodes[index] ?? id,
              to: id,
              dependencyStrength: 0.44,
              isOptional: true,
            }));
          }),
        }),
        readinessScore: scenario.slaProfile.windowMinutes,
        policyScore: report.policy.riskScore,
      },
    ],
  };
};

export const summarizeBatch = (batch: SimulationBatch): string => {
  if (batch.runs.length === 0) {
    return `${batch.tenant}: no runs`;
  }

  const best = batch.runs.reduce((acc, run) => (run.policyScore > acc.policyScore ? run : acc), batch.runs[0]!);
  return `${batch.tenant} | runs=${batch.runCount} | top=${best.policyScore} | coverage=${best.coverage.toFixed(1)} | readiness=${best.readinessScore.toFixed(1)}`;
};
