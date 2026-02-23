import { withBrand } from '@shared/core';
import type { RunSession, RunPlanSnapshot, RecoverySignal } from '@domain/recovery-operations-models';
import type { RiskBand } from '@domain/recovery-readiness';
import {
  createForgeIds,
  type ForgeBudgetEnvelope,
  type ForgeExecutionReport,
  type ForgeForecast,
  type ForgeGraph,
  type ForgeNode,
  type ForgeNodePriority,
  type ForgeRunId,
  type ForgePolicyResult,
  type ForgeScenario,
  type ForgeSimulationOutcome,
  type ForgeRuntimeConfig,
  type ForgeAttemptId,
} from './types';
import { buildPriorities, evaluateGraphHealth, splitByDepth } from './graph';
import { buildPolicy, summarizeCoverage, evaluateReadinessProjection } from './insights';

const buildDefaultBudget = (urgency: ForgeExecutionReport['policy']['urgency']): ForgeBudgetEnvelope => {
  if (urgency === 'critical') {
    return {
      parallelismLimit: 16,
      retryLimit: 5,
      maxDurationMinutes: 300,
      approvalRequired: false,
    };
  }

  if (urgency === 'urgent') {
    return {
      parallelismLimit: 10,
      retryLimit: 3,
      maxDurationMinutes: 210,
      approvalRequired: true,
    };
  }

  return {
    parallelismLimit: 6,
    retryLimit: 2,
    maxDurationMinutes: 120,
    approvalRequired: true,
  };
};

const inferUrgency = (signalCount: number, riskSignal: RiskBand, slaWindow: number): ForgeExecutionReport['policy']['urgency'] => {
  if (riskSignal === 'red' && slaWindow < 45) {
    return signalCount > 18 ? 'critical' : 'urgent';
  }
  if (signalCount > 14 || slaWindow < 60) {
    return 'urgent';
  }
  return 'routine';
};

const buildForecast = (planId: string, nodes: readonly ForgeNode[], projectedRisk: number): ForgeForecast => ({
  forecastId: withBrand(`${planId}-forecast`, 'RecoveryForgeForecastId'),
  planId: withBrand(planId, 'RecoveryForgePlanId'),
  commandWindowMinutes: nodes.reduce((acc, node) => acc + node.expectedDurationMinutes, 0),
  signalVolume: nodes.length * 2,
  expectedRisk: projectedRisk,
  projectedSloMargin: Math.max(0, 100 - projectedRisk),
  createdAt: new Date().toISOString(),
});

const scoreNode = (node: ForgeNode, signals: readonly RecoverySignal[]): number => {
  const sourceAffinity = signals.filter((signal) => signal.source === node.ownerTeam).length;
  const confidence = signals.length === 0 ? 0 : signals.reduce((acc, signal) => acc + signal.confidence, 0) / signals.length;
  return sourceAffinity * 0.6 + confidence * 10;
};

const buildAttempt = (
  policy: ForgePolicyResult,
  runId: ForgeRunId,
  nodes: readonly ForgeNode[],
): ForgeSimulationOutcome => {
  const attemptId: ForgeAttemptId = createForgeIds().attemptId;
  const confidence = summarizeCoverage({
    planId: policy.planId,
    tenant: 'tenant',
    createdAt: new Date().toISOString(),
    nodes,
    edges: [],
  });

  const outcomeScore = policy.riskScore;

  return {
    outcome: outcomeScore < 35 ? 'deferred' : outcomeScore > 80 ? 'approved' : 'blocked',
    attempts: [
      {
        attemptId,
        runId,
        status: outcomeScore > 80 ? 'complete' : 'failed',
        startedAt: new Date().toISOString(),
        finishedAt: new Date(Date.now() + nodes.length * 10_000).toISOString(),
        nodeCount: nodes.length,
        executedNodeIds: nodes.map((node) => node.id),
      },
    ],
    forecast: buildForecast(String(policy.planId), nodes, 100 - outcomeScore),
    confidenceBand: outcomeScore > 75 ? 'extreme' : outcomeScore > 50 ? 'high' : outcomeScore > 35 ? 'medium' : 'low',
    notes: [`run=${runId}`, `nodes=${nodes.length}`, `nodesConfidence=${confidence.toFixed(2)}`],
  };
};

const makeNodeFromSignal = (tenant: string, signal: RecoverySignal, index: number, signals: readonly RecoverySignal[]): ForgeNode => {
  const score = scoreNode(
    {
      id: signal.id,
      label: signal.source,
      commandType: signal.source,
      expectedDurationMinutes: 10,
      ownerTeam: signal.source,
      dependencies: [],
      resourceTags: [],
    },
    signals,
  );

  return {
    id: signal.id,
    label: `command:${signal.id}`,
    commandType: signal.source,
    expectedDurationMinutes: Math.max(4, 8 + Math.round(signal.severity + score)),
    ownerTeam: signal.source,
    dependencies: [
      {
        dependencyId: createForgeIds().dependencyId,
        dependencyName: `dependency-${tenant}-${index}`,
        criticality: (signal.severity % 5) as 1 | 2 | 3 | 4 | 5,
        coupling: Math.min(1, signal.confidence * 10),
      },
    ],
    resourceTags: ['readiness', tenant],
  };
};

export const buildExecutionReport = (
  tenant: string,
  scenario: ForgeScenario,
  config: Partial<ForgeRuntimeConfig> = {},
): ForgeExecutionReport => {
  const urgency = inferUrgency(scenario.signals.length, scenario.readinessPlan.riskBand, scenario.slaProfile.windowMinutes);
  const budget = {
    ...buildDefaultBudget(urgency),
    ...scenario.budget,
    ...(config.maxBudgetMinutes !== undefined
      ? {
          maxDurationMinutes: config.maxBudgetMinutes,
        }
      : {}),
  };

  const nodes = scenario.signals.map((signal, index) => makeNodeFromSignal(tenant, signal, index, scenario.signals));

  const fallback: ForgeNode = {
    id: `${tenant}-fallback`,
    label: 'Manual validation step',
    commandType: 'validation',
    expectedDurationMinutes: 12,
    ownerTeam: 'recovery-safety',
    dependencies: [],
    resourceTags: ['fallback'],
  };

  const allNodes = [...nodes, fallback];
  const graph: ForgeGraph = {
    planId: createForgeIds().planId,
    tenant,
    createdAt: new Date().toISOString(),
    nodes: allNodes,
    edges: allNodes
      .slice(1)
      .map((node, index) => ({
        from: allNodes[index]?.id ?? fallback.id,
        to: node.id,
        dependencyStrength: 0.45,
        isOptional: index % 2 === 0,
      })),
  };

  const priorities: ForgeNodePriority = buildPriorities(graph);
  const health = evaluateGraphHealth(graph);
  const policy = buildPolicy({
    urgency,
    budget,
    graphHealth: health,
    slaWindow: scenario.slaProfile.windowMinutes,
    nodeCount: allNodes.length,
    coverage: summarizeCoverage(graph),
    signals: scenario.signals,
    readinessRisk: scenario.readinessPlan.riskBand,
    priorities,
  });

  const topologies = splitByDepth(graph);
  const outcome = buildAttempt(policy, withBrand(`run-${tenant}`, 'RecoveryForgeRunId'), allNodes);
  const readinessProjection = evaluateReadinessProjection(scenario.readinessPlan.riskBand, scenario.slaProfile.windowMinutes);

  let report: ForgeExecutionReport = {
    tenant,
    scenarioHash: `${tenant}:${scenario.planSnapshot.id}`,
    topologies,
    policy,
    outcomes: [outcome],
    generatedAt: new Date().toISOString(),
  };

  if (config.minConfidence !== undefined && policy.riskScore < config.minConfidence) {
    report = {
      ...report,
      policy: {
        ...policy,
        pass: false,
        summary: `${policy.summary} :: confidence block`,
      },
    };
  }

  const finalRisk = report.outcomes.reduce((acc, item) => acc + item.forecast.expectedRisk, 0) / report.outcomes.length;
  if (finalRisk > readinessProjection) {
    return report;
  }

  return report;
};

export const buildDefaultPolicy = (
  tenant: string,
  session: RunSession,
  snapshot: RunPlanSnapshot,
  signals: readonly RecoverySignal[],
): ForgeExecutionReport => {
  const scenario: ForgeScenario = {
    tenant,
    readinessPlan: {
      planId: withBrand('default-readiness', 'RecoveryReadinessPlanId'),
      runId: withBrand('run-1', 'ReadinessRunId'),
      title: 'Default readiness plan',
      objective: 'stability',
      state: 'active',
      createdAt: new Date().toISOString(),
      targets: [],
      windows: [],
      signals: [],
      riskBand: 'green',
      metadata: {
        owner: 'recovery-command-forge',
        tags: ['default', 'policy'],
        tenant,
      },
    },
    session,
    planSnapshot: snapshot,
    signals,
    budget: {
      parallelismLimit: 5,
      retryLimit: 2,
      maxDurationMinutes: 120,
      approvalRequired: true,
    },
    slaProfile: {
      profileId: withBrand('slo', 'ReadinessSloProfileId'),
      name: 'default-slo',
      targets: [
        {
          key: 'rto',
          warningAt: 20,
          criticalAt: 60,
          unit: 'minutes',
        },
      ],
      windowMinutes: 90,
    },
  };

  return buildExecutionReport(tenant, scenario, {
    defaultUrgency: 'routine',
    maxBudgetMinutes: 120,
    minConfidence: 50,
    policyGateEnabled: true,
  });
};
