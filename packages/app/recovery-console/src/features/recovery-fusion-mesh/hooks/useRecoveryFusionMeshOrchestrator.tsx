import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  asMeshEventId,
  asMeshNodeId,
  asMeshPolicyId,
  asMeshPluginId,
  asMeshRunId,
  defaultTopology,
  type MeshExecutionContext,
  type MeshRun,
  type MeshNode,
  type MeshPolicy,
  type MeshTopology,
  type MeshSignalEnvelope,
  type MeshOrchestrationOutput,
} from '@domain/recovery-fusion-intelligence';
import { isCriticalSignal } from '@domain/recovery-fusion-intelligence';
import { executeMeshOrchestration, type MeshOrchestrationInput } from '@service/recovery-fabric-controller';

import type { RecoveryFusionMeshState } from '../types';

const policyGating = {
  ingest: true,
  normalize: true,
  plan: true,
  execute: true,
  observe: true,
  finish: true,
} as const;

const buildTopology = (runId: string): MeshTopology => {
  const nodes = defaultTopology.phases.toSorted().map((phase, index) => ({
    id: asMeshNodeId(`${runId}:mesh-${phase}:${index}`),
    role: (index % 2 === 0 ? 'source' : 'transform') as MeshNode['role'],
    score: Number.isFinite(0.85 - index * 0.1) ? Math.max(0, 1 - index * 0.08) : 0.6,
    phase,
    active: index % 2 === 0,
    metadata: {
      source: 'ui-orchestrator',
      phasePriority: String(index + 1),
    },
  }));

  const edges = nodes.slice(0, -1).flatMap((node, index) => ({
    from: node.id,
    to: nodes[index + 1]?.id ?? node.id,
    weight: 1 + (index % 3),
    latencyMs: 120 + index * 15,
    mandatory: index !== 2,
  }));

  return {
    runId: asMeshRunId('ui', runId),
    nodes,
    edges,
    updatedAt: new Date().toISOString(),
  };
};

const buildPolicy = (runId: string, waves: number): MeshPolicy => ({
  id: asMeshPolicyId(`ui-${runId}`),
  maxConcurrency: 3,
  allowPause: false,
  allowWarnings: true,
  pluginIds: Array.from({ length: Math.max(1, waves) }, (_, index) => asMeshPluginId(`ui-${runId}-plugin-${index}`)),
  phaseGating: policyGating,
});

const buildContext = (runId: string, topology: MeshTopology): MeshExecutionContext => ({
  runId: topology.runId,
  topology,
  policy: buildPolicy(runId, topology.nodes.length),
  phase: topology.nodes[0]?.phase ?? 'ingest',
  startedAt: new Date().toISOString(),
  metadata: {
    runType: 'ui',
    nodeCount: topology.nodes.length,
  },
});

const toRuntimeSignals = (runId: string, output: MeshOrchestrationOutput): readonly MeshSignalEnvelope[] =>
  output.commandIds.map((commandId, index) => ({
    id: asMeshEventId(
      asMeshRunId('ui', runId),
      output.phases[index % output.phases.length],
      index,
    ),
    phase: output.phases[index % output.phases.length],
    source: asMeshNodeId(`${runId}:signal-source:${index}`),
    class: output.phases[index % output.phases.length] === 'execute' ? 'warning' : 'baseline',
    severity: (((index + 1) % 6) as 0 | 1 | 2 | 3 | 4 | 5),
    payload: {
      command: commandId,
      phase: output.phases[index % output.phases.length],
      rank: index,
    },
    createdAt: new Date().toISOString(),
  }));

const defaultState = (): RecoveryFusionMeshState => ({
  run: null,
  output: null,
  isRunning: false,
  signals: [],
  error: null,
  phases: ['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'],
});

const toOrchestrationInput = (): MeshOrchestrationInput => {
  const runId = `${Date.now()}`;
  const topology = buildTopology(runId);
  const policy = buildPolicy(runId, topology.nodes.length);
  const context = buildContext(runId, topology);

  return {
    topology,
    policy,
    pluginManifests: [],
    context,
  };
};

export const useRecoveryFusionMeshOrchestrator = () => {
  const [state, setState] = useState<RecoveryFusionMeshState>(defaultState);
  const activeRun = useRef<boolean>(false);

  const runOrchestration = useCallback(async () => {
    activeRun.current = true;
    setState((previous) => ({ ...previous, isRunning: true, error: null }));

    const input = toOrchestrationInput();
    const result = await executeMeshOrchestration(input);

    if (!activeRun.current) return;

    if (!result.ok) {
      setState((previous) => ({ ...previous, isRunning: false, error: result.error.message }));
      return;
    }

    setState((previous) => ({
      ...previous,
      isRunning: false,
      run: input.topology
        ? ({
            id: input.context.runId,
            topology: input.topology,
            waves: result.value.waves,
            policies: [input.policy.id],
            phase: result.value.phases.at(-1) ?? 'finish',
            createdAt: new Date().toISOString(),
          } satisfies MeshRun)
        : previous.run,
      output: result.value,
      signals: toRuntimeSignals(input.context.runId, result.value),
      phases: result.value.phases,
    }));
  }, []);

  const topCriticalSignals = useMemo(
    () => (state.output ? state.output.summary.warningRatio > 0.2 : false),
    [state.output],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      void runOrchestration();
    }, 7000);
    return () => {
      activeRun.current = false;
      clearInterval(interval);
    };
  }, [runOrchestration]);

  const clear = useCallback(() => setState(defaultState), []);

  return {
    state,
    runOrchestration,
    clear,
    topCriticalSignals: isCriticalSignal(topCriticalSignals ? 5 : 0),
  };
};
