import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdaptiveSimulationOutput, AdaptiveSimulationRequest } from '../services/adaptiveSimulationService';
import {
  runAdaptiveSimulationSuite,
  runAdaptiveSimulationBatch,
  buildSimulationSeed,
} from '../services/adaptiveSimulationService';

type RunMode = 'single' | 'batch';

interface TopologyPreset {
  readonly topology: AdaptiveSimulationRequest['topology'];
  readonly requestedBy: string;
}

const baseRequest = (preset: TopologyPreset): AdaptiveSimulationRequest => ({
  tenant: 'tenant-a',
  workspace: 'workspace-a',
  scenario: 'scenario-a',
  requestedBy: preset.requestedBy,
  topology: preset.topology,
  signals: [
    {
      id: 'signal-1',
      tier: 'warning',
      score: 88,
      confidence: 0.9,
      namespace: 'recovery:primary',
      tags: [{ key: 'source', value: 'monitor' }],
    },
    {
      id: 'signal-2',
      tier: 'critical',
      score: 95,
      confidence: 0.96,
      namespace: 'recovery:edge',
      tags: [{ key: 'source', value: 'edge-monitor' }],
    },
  ],
  plans: [
    { id: 'plan-1', title: 'contain', sessionId: 'session-a', confidence: 0.88 },
    { id: 'plan-2', title: 'restore', sessionId: 'session-a', confidence: 0.78 },
    { id: 'plan-3', title: 'stabilize', sessionId: 'session-a', confidence: 0.91 },
  ],
});

interface AdaptiveSimulationState {
  readonly mode: RunMode;
  readonly request: AdaptiveSimulationRequest;
  readonly running: boolean;
  readonly outputs: readonly AdaptiveSimulationOutput[];
  readonly lastOutput: AdaptiveSimulationOutput | null;
  readonly summary: string;
  readonly runSingle: () => Promise<void>;
  readonly queue: () => Promise<void>;
  readonly setTenant: (tenant: string) => void;
  readonly setWorkspace: (workspace: string) => void;
  readonly setScenario: (scenario: string) => void;
  readonly setTopology: (topology: AdaptiveSimulationRequest['topology']) => void;
  readonly setMode: (next: RunMode) => void;
}

const collectTopologies = (input: AdaptiveSimulationRequest): readonly string[] => [
  `${input.tenant}:${input.scenario}`,
  `${input.topology}(${input.signals.length})`,
];

export const useAdaptiveSimulation = (): AdaptiveSimulationState => {
  const [mode, setModeState] = useState<RunMode>('single');
  const [tenant, setTenantState] = useState(baseRequest({ topology: 'grid', requestedBy: 'operator' }).tenant);
  const [workspace, setWorkspaceState] = useState(baseRequest({ topology: 'grid', requestedBy: 'operator' }).workspace);
  const [scenario, setScenarioState] = useState(baseRequest({ topology: 'grid', requestedBy: 'operator' }).scenario);
  const [topology, setTopologyState] = useState<AdaptiveSimulationRequest['topology']>('grid');
  const [outputs, setOutputs] = useState<readonly AdaptiveSimulationOutput[]>([]);
  const [running, setRunning] = useState(false);
  const [requestFingerprint, setRequestFingerprint] = useState('');

  const requestedBy = useMemo(() => {
    const owner = tenant.startsWith('tenant-') ? 'operator' : tenant;
    return owner;
  }, [tenant]);

  const request = useMemo<AdaptiveSimulationRequest>(() => ({
    ...baseRequest({ topology, requestedBy }),
    tenant,
    workspace,
    scenario,
    requestedBy,
  }), [tenant, workspace, scenario, topology, requestedBy]);

  const runSingle = useCallback(async () => {
    setRunning(true);
    try {
      const output = await runAdaptiveSimulationSuite(request);
      const latest = [output, ...outputs].slice(0, 30);
      setOutputs(latest);
      setRequestFingerprint(await buildSimulationSeed(request));
    } finally {
      setRunning(false);
    }
  }, [request, outputs]);

  const queue = useCallback(async () => {
    setRunning(true);
    try {
      const fanout: AdaptiveSimulationRequest[] = [1, 2, 3, 4].map((value) => ({
        ...request,
        scenario: `${request.scenario}-${value}`,
        tenant: `${request.tenant}-${value}`,
        workspace: `${request.workspace}-${value}`,
      }));
      const batch = await runAdaptiveSimulationBatch(fanout);
      setOutputs((previous) => [...batch, ...previous].slice(0, 50));
    } finally {
      setRunning(false);
    }
  }, [request]);

  const setTenant = useCallback((next: string) => setTenantState(next.trim() || 'tenant-a'), []);
  const setWorkspace = useCallback((next: string) => setWorkspaceState(next.trim() || 'workspace-a'), []);
  const setScenario = useCallback((next: string) => setScenarioState(next.trim() || 'scenario-a'), []);
  const setTopology = useCallback((next: AdaptiveSimulationRequest['topology']) => setTopologyState(next), []);
  const setMode = useCallback((next: RunMode) => setModeState(next), []);

  const lastOutput = outputs.at(0) ?? null;
  const summary = useMemo(() => {
    const route = collectTopologies(request).join(' | ');
    const latestScore = lastOutput
      ? `${lastOutput.result.output.summary.health} ${lastOutput.result.output.summary.riskIndex.toFixed(2)}`
      : 'no-run';
    return `${requestFingerprint || 'fp:unknown'} :: ${route} :: ${latestScore}`;
  }, [requestFingerprint, request, lastOutput]);

  useEffect(() => {
    if (mode === 'single' && outputs.length === 0) {
      void runSingle();
    }
  }, [mode, outputs.length, runSingle]);

  return {
    mode,
    request,
    running,
    outputs,
    lastOutput,
    summary,
    runSingle,
    queue,
    setTenant,
    setWorkspace,
    setScenario,
    setTopology,
    setMode,
  };
};
