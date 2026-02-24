import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { executeMeshOrchestration, type MeshOrchestrationInput } from '@service/recovery-fabric-controller';
import { buildPlan, defaultTopology, type MeshRun } from '@domain/recovery-fusion-intelligence';
import { isCriticalSignal } from '@domain/recovery-fusion-intelligence';
import type { MeshOrchestrationOutput } from '@service/recovery-fabric-controller';

import type { RecoveryFusionMeshState } from '../types';

const toTopologyRun = async (): Promise<MeshOrchestrationInput> => {
  const runId = `ui-${Date.now()}` as MeshRun['id'];
  const runtimeInput = {
    runId,
    phases: defaultTopology.phases,
    nodes: defaultTopology.phases.map((phase, index) => ({
      id: `ui-node:${phase}:${index}` as never,
      role: index % 2 === 0 ? 'source' : 'sink',
      score: (index + 1) / 10,
      phase,
      active: index % 2 === 0,
      metadata: { source: 'ui' },
    })),
    edges: [],
    pluginIds: ['bootstrap-plugin'],
    tenant: 'ui-tenant',
  };

  const plan = buildPlan(runtimeInput as never);
  return {
    topology: {
      runId,
      nodes: runtimeInput.nodes as never,
      edges: [],
      updatedAt: new Date().toISOString(),
    },
    policy: {
      id: `policy-${runId}` as never,
      maxConcurrency: 2,
      allowPause: true,
      allowWarnings: true,
      pluginIds: plan.waves.flatMap((wave) => wave.id as never),
      phaseGating: {
        ingest: true,
        normalize: true,
        plan: true,
        execute: true,
        observe: true,
        finish: true,
      },
    },
    pluginManifests: [],
    context: {
      runId,
      topology: {
        runId,
        nodes: runtimeInput.nodes as never,
        edges: [],
        updatedAt: new Date().toISOString(),
      },
      policy: {
        id: `policy-${runId}` as never,
        maxConcurrency: 2,
        allowPause: true,
        allowWarnings: true,
        pluginIds: [],
        phaseGating: {
          ingest: true,
          normalize: true,
          plan: true,
          execute: true,
          observe: true,
          finish: true,
        },
      },
      startedAt: new Date().toISOString(),
      metadata: {},
    },
  };
};

const defaultState = (): RecoveryFusionMeshState => ({
  run: null,
  output: null,
  isRunning: false,
  error: null,
  phases: ['ingest', 'normalize', 'plan', 'execute', 'observe', 'finish'],
});

export const useRecoveryFusionMeshOrchestrator = () => {
  const [state, setState] = useState<RecoveryFusionMeshState>(defaultState);
  const activeRun = useRef<boolean>(false);

  const runOrchestration = useCallback(async () => {
    activeRun.current = true;
    setState((previous) => ({ ...previous, isRunning: true, error: null }));

    const input = await toTopologyRun();
    const result = await executeMeshOrchestration(input);

    if (!activeRun.current) return;

    if (!result.ok) {
      setState((previous) => ({ ...previous, isRunning: false, error: result.error.message }));
      return;
    }

    setState((previous) => ({
      ...previous,
      isRunning: false,
      output: result.value as MeshOrchestrationOutput,
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
