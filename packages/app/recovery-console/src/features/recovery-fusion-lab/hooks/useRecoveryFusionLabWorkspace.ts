import { useEffect, useReducer, useState } from 'react';

import { mockLabRequest } from '../mocks';
import { executeFusionLab, runDefaultFusionLab } from '../services/fusionLabClient';
import type {
  FusionLabCommandAction,
  FusionLabFilter,
  FusionLabPageState,
  FusionLabTopologyNode,
  FusionLabWorkspaceEnvelope,
} from '../types';

type FusionLabAction =
  | { type: 'refresh' }
  | { type: 'reset' }
  | { type: 'select-node'; payload: string }
  | { type: 'set-filter'; payload: FusionLabFilter };

const DEFAULT_FILTER: FusionLabFilter = {
  mode: 'live',
  includeSimulation: true,
  minimumSeverity: 1,
};

const mapModeToRunMode = (mode: 'draft' | 'live' | 'audit'): 'realtime' | 'dry-run' =>
  mode === 'draft' ? 'dry-run' : 'realtime';

const calculateHealth = (waves: readonly unknown[], signals: readonly unknown[]): number => {
  if (signals.length === 0) return 0;
  const severityScale = 100 / Math.max(1, signals.length);
  return Number((waves.length * severityScale).toFixed(2));
};

const reduceWorkspace = (
  _state: FusionLabPageState,
  action: FusionLabAction,
): FusionLabPageState => {
  switch (action.type) {
    case 'refresh':
      return { ..._state, loading: true };
    case 'reset':
      return {
        ..._state,
        loading: false,
        selectedNodeId: undefined,
        errorMessage: undefined,
      };
    case 'select-node':
      return { ..._state, selectedNodeId: action.payload, loading: false };
    case 'set-filter':
      return { ..._state, mode: action.payload.mode, loading: true };
    default:
      return _state;
  }
};

const createSeedNodes = (tenant: string): readonly FusionLabTopologyNode[] => [
  {
    id: `${tenant}/node-a`,
    name: 'Signal Capture',
    active: true,
    score: 0.95,
  },
  {
    id: `${tenant}/node-b`,
    name: 'Signal Synthesizer',
    active: true,
    score: 0.88,
  },
];

export const useRecoveryFusionLabWorkspace = (tenant: string, workspace: string): FusionLabWorkspaceEnvelope => {
  const [filter] = useState<FusionLabFilter>(DEFAULT_FILTER);
  const [refresh, setRefresh] = useState(0);
  const [requestError, setRequestError] = useState<string | undefined>(undefined);
  const [requestEnvelope, setRequestEnvelope] = useState<FusionLabWorkspaceEnvelope | undefined>(undefined);
  const [state, dispatch] = useReducer(reduceWorkspace, {
    loading: true,
    workspace,
    waveCount: 0,
    signalCount: 0,
    commandCount: 0,
    healthScore: 0,
    mode: DEFAULT_FILTER.mode,
  } as FusionLabPageState);

  const [nodes, setNodes] = useState<readonly FusionLabTopologyNode[]>(createSeedNodes(tenant));

  useEffect(() => {
    const request = mockLabRequest(tenant, workspace);
    const requestWithOverrides = {
      ...request,
      mode: mapModeToRunMode(filter.mode),
      topology: {
        ...request.topology,
        nodes: filter.includeSimulation ? request.topology.nodes : request.topology.nodes,
      },
    };
    let disposed = false;

    const run = async (): Promise<void> => {
      dispatch({ type: 'refresh' });
      const result = await runDefaultFusionLab(tenant, workspace);
      if (disposed) return;
      if (!result.ok) {
        setRequestError(result.error.message);
        dispatch({ type: 'reset' });
        return;
      }

      const resultWorkspace = await executeFusionLab(requestWithOverrides, {
        includeTelemetry: true,
        useTopLevelBootstrap: true,
        pluginNames: ['fusion-lab-plugin:default'],
      });

      if (disposed) return;
      setRequestEnvelope({
        request,
        result: resultWorkspace.ok ? resultWorkspace.value : undefined,
        state: {
          loading: false,
          workspace,
          mode: filter.mode,
          waveCount: resultWorkspace.ok ? resultWorkspace.value.waves.length : 0,
          signalCount: resultWorkspace.ok ? resultWorkspace.value.signals.length : 0,
          commandCount: resultWorkspace.ok ? resultWorkspace.value.commands.length : 0,
          healthScore: calculateHealth(result.value?.plan?.waves ?? [], result.value?.plan?.signals ?? []),
          selectedNodeId: undefined,
          errorMessage: resultWorkspace.ok ? undefined : resultWorkspace.error.message,
        },
      });
      dispatch({ type: 'select-node', payload: `${tenant}/node-a` });
      setNodes((previous) => (previous.length === 0 ? createSeedNodes(tenant) : previous));
      setRefresh((current) => current + 1);
    };

    void run();
    return () => {
      disposed = true;
    };
  }, [tenant, workspace, filter, refresh]);

  const onAction = (_action: FusionLabCommandAction) => {
    dispatch({ type: 'refresh' });
    setRefresh((current) => current + 1);
  };

  const onNodeSelect = (nodeId: string) => {
    dispatch({ type: 'select-node', payload: nodeId });
  };

  return {
    request: requestEnvelope?.request ?? mockLabRequest(tenant, workspace),
    result: requestEnvelope?.result,
    state: {
      ...requestEnvelope?.state,
      loading: requestEnvelope?.state?.loading ?? true,
      workspace,
      waveCount: requestEnvelope?.state?.waveCount ?? 0,
      signalCount: requestEnvelope?.state?.signalCount ?? 0,
      commandCount: requestEnvelope?.state?.commandCount ?? 0,
      healthScore: requestEnvelope?.state?.healthScore ?? 0,
      mode: requestEnvelope?.state?.mode ?? filter.mode,
      errorMessage: requestError ?? requestEnvelope?.state?.errorMessage,
      selectedNodeId: requestEnvelope?.state?.selectedNodeId,
    },
  };
};
