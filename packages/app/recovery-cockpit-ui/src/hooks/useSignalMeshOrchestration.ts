import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createMeshTopology,
  createNodeId,
  createPlanId,
  type MeshIntent,
  type MeshTopology,
  type MeshSignal,
  toEventName,
  createTenantId,
  createRunId,
  createIntentId,
  createSignalId,
  type MeshSignalName,
  type MeshExecutionPhase,
  type MeshEnvelope,
  createRegionId,
} from '@domain/recovery-cockpit-signal-mesh';
import { InMemorySignalMeshStore } from '@data/recovery-cockpit-signal-mesh-store';
import { SignalMeshOrchestrator, runSignalMesh } from '@service/recovery-cockpit-signal-orchestrator';
import { createDefaultConfig } from '@service/recovery-cockpit-signal-orchestrator';

const fakeTopology = () => createMeshTopology(createTenantId('tenant-alpha'), createRegionId('us-east-1'), createRunId('run-0'));

type SignalMeshState = {
  readonly loading: boolean;
  readonly topology: MeshTopology;
  readonly snapshots: readonly MeshEnvelope[];
  readonly intents: readonly MeshIntent[];
  readonly signals: readonly MeshSignal[];
  readonly commands: readonly string[];
};

const defaultState: SignalMeshState = {
  loading: true,
  topology: fakeTopology(),
  snapshots: [],
  intents: [],
  signals: [],
  commands: ['mesh:diagnose', 'mesh:stabilize', 'mesh:rollback'],
};

export const useSignalMesh = () => {
  const [state, setState] = useState<SignalMeshState>(defaultState);
  const store = useMemo(() => new InMemorySignalMeshStore(), []);
  const orchestrator = useMemo(() => {
    const config = createDefaultConfig('tenant-alpha');
    return new SignalMeshOrchestrator(config, [], store);
  }, [store]);

  const rebuild = useCallback(async () => {
    const plan = {
      id: createPlanId('plan-2'),
      tenant: state.topology.tenant,
      runId: createRunId('run-0'),
      label: 'signal-mesh',
      scope: `${state.topology.tenant as string}/${state.topology.region as string}`,
      intents: [
        {
          id: createIntentId('intent:drain'),
          tenant: state.topology.tenant,
          runId: createRunId('run-0'),
          labels: ['drain', 'failover'],
          phase: 'detect' as const,
          targetNodeIds: [createNodeId('mesh-node:node-1')],
          expectedConfidence: 0.82,
          command: 'mesh:assess',
        },
      ],
      steps: [],
    };
    setState((prev) => ({ ...prev, loading: true }));
    const result = await runSignalMesh(orchestrator, plan as never);
    const planSignals: MeshSignal[] = state.topology.nodes.map((node) => ({
      id: createSignalId(`command:${node.id as string}`),
      tenant: state.topology.tenant,
      region: state.topology.region,
      kind: 'command',
      name: `mesh:${state.topology.tenant as string}:signal:${node.id as string}` as MeshSignalName,
      severity: 'warn',
      riskBand: 'moderate',
      confidence: 0.9,
      labels: ['from-ui'],
      payload: {},
      createdAt: new Date().toISOString(),
    }));
    const latestSnapshots = await orchestrator.collectSnapshots(plan.runId);
    setState((prev) => ({
      ...prev,
      loading: false,
      snapshots: latestSnapshots,
      intents: plan.intents,
      signals: [...prev.signals, ...planSignals],
      commands: [
        ...new Set([
          ...prev.commands,
          ...result.snapshots.map((snapshot) =>
            toEventName(snapshot.event.tenant, snapshot.event.eventId, snapshot.event.name),
          ),
        ]),
      ],
    }));
  }, [state.topology, orchestrator]);
  
  useEffect(() => {
    void rebuild();
  }, [rebuild]);

  const dispatchCommand = useCallback(
    async (command: string) => {
      const plan = {
        id: createPlanId(`plan:${Date.now()}`),
        tenant: createTenantId('tenant-alpha'),
        runId: createRunId(`run-${Date.now()}`),
        label: 'interactive-command',
        scope: `tenant-alpha/${createRegionId('us-east-1') as string}`,
        intents: [
          {
            id: createIntentId(`intent:${command}`),
            tenant: createTenantId('tenant-alpha'),
            runId: createRunId(`run-${Date.now()}`),
            labels: ['manual', 'command'],
            phase: 'orchestrate' as const,
            targetNodeIds: [createNodeId('mesh-node:command')],
            expectedConfidence: 0.65,
            command,
          },
        ],
        steps: [],
      };
      const run = await runSignalMesh(orchestrator, plan as never);
      setState((prev) => ({ ...prev, snapshots: [...prev.snapshots, ...run.snapshots], loading: false }));
    },
    [orchestrator],
  );

  const reload = useCallback(() => {
    void rebuild();
  }, [rebuild]);

  return {
    ...state,
    reload,
    dispatchCommand,
  };
};
