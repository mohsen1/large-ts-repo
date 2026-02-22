import type {
  FabricAnalysisResult,
  FabricCommand,
  FabricCommandMap,
  FabricDependencyMode,
  FabricPlan,
  FabricPolicy,
  FabricReadinessLevel,
  FabricRun,
  FabricTopology,
} from './types';
import { orderedExecutionPlan } from './graph';
import { estimateReadinessLevel, estimateRiskBand } from './policy';

export interface FabricMetricPoint {
  readonly commandId: FabricCommand['id'];
  readonly readinessScore: number;
  readonly riskScore: number;
  readonly dependencyDepth: number;
}

export interface FabricAnalytics {
  readonly commandCount: number;
  readonly depth: number;
  readonly blockedDependencies: number;
  readonly estimatedDurationMinutes: number;
  readonly readinessScore: number;
  readonly riskScore: number;
  readonly points: readonly FabricMetricPoint[];
  readonly warnings: readonly string[];
}

const readinessToScore = (band: FabricReadinessLevel): number => {
  switch (band) {
    case 'critical':
      return 95;
    case 'hot':
      return 70;
    case 'warm':
      return 45;
    case 'cold':
      return 20;
    default:
      return 50;
  }
};

const riskToScore = (band: ReturnType<typeof estimateRiskBand>): number => {
  switch (band) {
    case 'green':
      return 15;
    case 'amber':
      return 55;
    case 'red':
      return 85;
    case 'black':
      return 100;
    default:
      return 60;
  }
};

const readTopology = (plan: FabricPlan): readonly FabricCommand['id'][] => {
  return orderedExecutionPlan(plan.topology);
};

const estimateBlockedEdges = (plan: FabricPlan): number => {
  return plan.topology.edges.filter((edge) => edge.mandatory === true).length;
};

const classifyModeLoad = (mode: FabricDependencyMode): number => {
  switch (mode) {
    case 'hard':
      return 3;
    case 'soft':
      return 2;
    case 'advisory':
      return 1;
    default:
      return 1;
  }
};

export const analyzePlan = (
  policy: FabricPolicy,
  commandMap: FabricCommandMap,
  plan: FabricPlan,
): FabricAnalytics => {
  const commands = [...commandMap.values()];
  const orderedCommandIds = readTopology(plan);
  const readinessBand = estimateReadinessLevel(commands);
  const readinessScore = readinessToScore(readinessBand);
  const riskBand = estimateRiskBand(
    readinessBand,
    policy.maxRetries,
    commands.reduce((acc, command) => acc + command.requiresApprovals, 0),
  );
  const riskScore = riskToScore(riskBand);

  const points = commands.map((command, index) => ({
    commandId: command.id,
    readinessScore: readinessScore + classifyModeLoad(plan.topology.edges[index]?.mode ?? 'advisory'),
    riskScore: riskScore + index,
    dependencyDepth: orderedCommandIds.indexOf(command.id),
  }));

  const estimatedDurationMinutes = commands.reduce((sum, command) => sum + command.estimatedRecoveryMinutes, 0);

  return {
    commandCount: commands.length,
    depth: orderedCommandIds.length,
    blockedDependencies: estimateBlockedEdges(plan),
    estimatedDurationMinutes,
    readinessScore,
    riskScore,
    points,
    warnings: commands.length === 0 ? ['no commands to analyze'] : [],
  };
};

const syntheticCommandMap = (commands: readonly FabricCommand[]): FabricCommandMap => {
  return new Map(commands.map((command) => [command.id, command]));
};

export const summarizeRun = (run: FabricRun, policy: FabricPolicy): FabricAnalysisResult => {
  const commandMap = syntheticCommandMap(
    run.commandIds.map((commandId) => ({
      id: commandId,
      tenantId: run.tenantId,
      incidentId: run.incidentId,
      name: `command-${String(commandId)}`,
      priority: 1 as 1 | 2 | 3 | 4 | 5,
      blastRadius: 1,
      estimatedRecoveryMinutes: 1,
      strategy: 'serial',
      constraints: [],
      runbook: [],
      context: {},
      requiresApprovals: 0,
      requiresWindows: run.windows,
    })),
  );

  const emptyTopology: FabricTopology = {
    commandIds: [...run.commandIds],
    edges: [],
    zones: {
      serial: [...run.commandIds],
      parallel: [],
      staged: [],
    },
    metadata: { synthetic: true, commandCount: run.commandIds.length },
  };

  const plan: FabricPlan = {
    tenantId: run.tenantId,
    policyId: run.policyId,
    fabricId: run.fabricId,
    commands: [...commandMap.values()],
    topology: emptyTopology,
  };

  const analysis = analyzePlan(policy, commandMap, plan);

  return {
    fabricId: run.fabricId,
    canExecute: run.status !== 'failed' && analysis.blockedDependencies === 0,
    readinessBand: analysis.readinessScore > 60 ? 'hot' : analysis.readinessScore > 40 ? 'warm' : 'cold',
    riskBand: estimateRiskBand(analysis.readinessScore > 60 ? 'hot' : analysis.readinessScore > 40 ? 'warm' : 'cold', policy.maxRetries, run.commandIds.length),
    selectedCommandIds: run.commandIds,
    commandCount: run.commandIds.length,
    maxRiskCommand: run.commandIds[0] ?? null,
    warnings: analysis.warnings,
  };
};
