import type {
  ForgeExecutionReport,
  ForgeNode,
  ForgePolicyResult,
  ForgeRunId,
  ForgeRuntimeConfig,
  ForgeScenario,
  ForgeTopology,
} from './types';
import { buildExecutionReport } from './planner';
import { buildPriorities } from './graph';
import { buildPolicy } from './insights';
import { withBrand } from '@shared/core';

export type ForgeWaveId = string & { readonly __brand: 'RecoveryForgeWaveId' };

export interface OrchestratedWave {
  readonly waveId: ForgeWaveId;
  readonly waveIndex: number;
  readonly commandNodes: readonly ForgeNode[];
  readonly ordered: readonly string[];
  readonly constraintsSatisfied: boolean;
  readonly policy: ForgePolicyResult;
}

export interface OrchestrationRun {
  readonly runId: ForgeRunId;
  readonly report: ForgeExecutionReport;
  readonly waves: readonly OrchestratedWave[];
}

export interface OrchestratorConfig {
  readonly preferHighBand: boolean;
  readonly maxWaveNodes: number;
  readonly includePolicyForecast: boolean;
}

const splitWaveNodes = (nodes: readonly ForgeNode[], maxWaveNodes: number): readonly ForgeNode[][] => {
  const chunks: ForgeNode[][] = [];
  for (let index = 0; index < nodes.length; index += maxWaveNodes) {
    chunks.push(nodes.slice(index, index + maxWaveNodes));
  }
  return chunks;
};

export const orchestrateWave = (
  scenario: ForgeScenario,
  priorities: Record<string, number>,
  config: Partial<OrchestratorConfig> = {},
): readonly OrchestratedWave[] => {
  const nodes = [...scenario.signals].map((signal) => ({
    id: `${scenario.tenant}-node-${signal.id}`,
    label: `command-${signal.source}-${signal.id}`,
    commandType: signal.source,
    expectedDurationMinutes: Math.max(2, signal.severity + ((signal.id.length % 5) + 1)),
    ownerTeam: signal.source,
    dependencies: [],
    resourceTags: ['orchestrated', 'signal'],
  }));

  const ordered = [...nodes].sort((left, right) => (priorities[right.id] ?? 0) - (priorities[left.id] ?? 0));
  const chunks = splitWaveNodes(ordered, Math.max(1, config.maxWaveNodes ?? 5));

  return chunks.map((chunk, index) => {
    const wavePolicy = buildPolicy({
      urgency: scenario.slaProfile.windowMinutes < 90 ? 'urgent' : 'routine',
      budget: scenario.budget,
      graphHealth: {
        hasCycles: false,
        averageFanIn: 0,
        averageFanOut: 0,
        nodeCount: chunk.length,
        edgeCount: Math.max(0, chunk.length - 1),
      },
      slaWindow: scenario.slaProfile.windowMinutes,
      nodeCount: chunk.length,
      coverage: Math.min(1, chunk.length / Math.max(1, nodes.length)),
      signals: scenario.signals,
      readinessRisk: 'amber',
      priorities,
    });

    const duration = chunk.reduce((acc, node) => acc + node.expectedDurationMinutes, 0);
    return {
      waveId: withBrand(`wave-${scenario.tenant}-${index}`, 'RecoveryForgeWaveId') as ForgeWaveId,
      waveIndex: index,
      commandNodes: chunk,
      ordered: chunk.map((node) => node.id),
      constraintsSatisfied: duration <= scenario.budget.maxDurationMinutes,
      policy: wavePolicy,
    };
  });
};

export const buildOrchestratedRun = (
  tenant: string,
  scenario: ForgeScenario,
  runtime: Partial<ForgeRuntimeConfig> = {},
): OrchestrationRun => {
  const report = buildExecutionReport(tenant, scenario, runtime);
  const priorities = buildPriorities({
    planId: report.topologies[0]?.planId ?? withBrand(`seed-${tenant}`, 'RecoveryForgePlanId'),
    tenant,
    createdAt: report.generatedAt,
    nodes: report.topologies.flatMap((topology) => topology.nodes.map((node) => node.node)),
    edges: report.topologies.flatMap((topology, topologyIndex) => {
      const nodeIds = topology.nodes.map((node) => node.node.id);
      return nodeIds.slice(1).map((targetId, nodeIndex) => ({
        from: nodeIds[nodeIndex] ?? targetId,
        to: targetId,
        dependencyStrength: 0.4 + topologyIndex * 0.1,
        isOptional: nodeIndex % 2 === 0,
      }));
    }),
  });

  const waves = orchestrateWave(scenario, priorities, {
    preferHighBand: runtime.policyGateEnabled ?? true,
    maxWaveNodes: 6,
    includePolicyForecast: true,
  });

  return {
    runId: withBrand(`run-${tenant}-${Date.now()}`, 'RecoveryForgeRunId'),
    report,
    waves,
  };
};

export const mergeOrchestrations = (left: OrchestrationRun, right: OrchestrationRun): OrchestrationRun => ({
  runId: withBrand(`merged-${left.runId}`, 'RecoveryForgeRunId'),
  report: right.report,
  waves: [...left.waves, ...right.waves],
});

export const waveReadinessDelta = (waves: readonly OrchestratedWave[]): number => {
  if (waves.length === 0) {
    return 0;
  }
  const satisfied = waves.filter((wave) => wave.constraintsSatisfied).length;
  const topNodeCounts = waves.reduce((acc, wave) => acc + wave.commandNodes.length, 0);
  return Number(((satisfied / waves.length) * Math.min(100, topNodeCounts * 5)).toFixed(2));
};

export const routeByBand = (waves: readonly OrchestratedWave[]): readonly string[] =>
  waves.map((wave) => {
    const policySummary = `pass=${wave.policy.pass ? 'yes' : 'no'}`;
    return `${wave.waveId}:${wave.waveIndex}:${policySummary}`;
  });

export const evaluateOrchestration = (run: OrchestrationRun): boolean =>
  run.waves.every((wave) => wave.constraintsSatisfied && wave.policy.pass);
