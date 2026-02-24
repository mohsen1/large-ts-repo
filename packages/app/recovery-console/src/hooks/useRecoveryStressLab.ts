import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { inspectFleet } from '@service/recovery-stress-lab-orchestrator/stress-lab-inspector';
import { runObserver } from '@service/recovery-stress-lab-orchestrator/stress-lab-observer';
import {
  type FleetRunOptions,
  type FleetRunResult,
} from '@service/recovery-stress-lab-orchestrator/stress-lab-fleet';
import type { WorkflowNode } from '@domain/recovery-stress-lab-intelligence/flow-graph';
import { buildFleetPlan, executeFleet } from '@service/recovery-stress-lab-orchestrator/stress-lab-fleet';
import { compileWorkflowScript } from '@domain/recovery-stress-lab-intelligence/orchestration-dsl';
import { parseFleetInput } from '@service/recovery-stress-lab-orchestrator/stress-lab-fleet';

export type StressLabAction =
  | { type: 'boot' }
  | { type: 'run' }
  | { type: 'fail'; readonly error: string }
  | { type: 'stop' }
  | { type: 'observe' }
  | { type: 'ready'; readonly result: FleetRunResult };

interface StressLabState {
  readonly loading: boolean;
  readonly running: boolean;
  readonly observations: readonly string[];
  readonly result?: FleetRunResult;
  readonly error?: string;
}

const initialState: StressLabState = {
  loading: false,
  running: false,
  observations: [],
};

const reducer = (state: StressLabState, action: StressLabAction): StressLabState => {
  switch (action.type) {
    case 'boot':
      return { ...state, loading: true, error: undefined };
    case 'run':
      return { ...state, running: true, loading: true, error: undefined };
    case 'observe':
      return { ...state, observations: ['observer', ...state.observations].slice(0, 6), loading: false, running: false };
    case 'ready':
      return { ...state, result: action.result, running: false, loading: false };
    case 'stop':
      return { ...state, running: false, loading: false };
    case 'fail':
      return { ...state, loading: false, running: false, error: action.error };
    default:
      return state;
  }
};

const defaultGraph = {
  region: 'us-east-1',
  nodes: [
    { id: 'seed', lane: 'observe', kind: 'seed', outputs: ['prepare'] },
    { id: 'prepare', lane: 'simulate', kind: 'simulate', outputs: ['verify'] },
    { id: 'verify', lane: 'verify', kind: 'verify', outputs: ['recommend'] },
    { id: 'recommend', lane: 'recommend', kind: 'recommend', outputs: ['restore'] },
    { id: 'restore', lane: 'restore', kind: 'restore', outputs: [] },
  ],
  edges: [
    {
      id: 'seed->prepare',
      from: 'seed',
      to: ['prepare'],
      direction: 'northbound',
      channel: 'seed-channel',
    },
    {
      id: 'prepare->verify',
      from: 'prepare',
      to: ['verify'],
      direction: 'interlane',
      channel: 'prepare-channel',
    },
    {
      id: 'verify->recommend',
      from: 'verify',
      to: ['recommend'],
      direction: 'interlane',
      channel: 'verify-channel',
    },
    {
      id: 'recommend->restore',
      from: 'recommend',
      to: ['restore'],
      direction: 'southbound',
      channel: 'restore-channel',
    },
  ],
} as const;

export const useRecoveryStressLab = (tenantId: string, zone = 'default-zone') => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const runSequenceRef = useRef(0);
  const [runtimePlan, setRuntimePlan] = useState(() => buildFleetPlan(tenantId, zone, parseFleetInput(defaultGraph)));
  const manifest = useMemo(() => ({ tenant: tenantId, zone }), [tenantId, zone]);

  const withFailure = useCallback((message: string): void => {
    dispatch({ type: 'fail', error: message });
  }, []);

  const run = useCallback(async () => {
    dispatch({ type: 'run' });
    try {
      runSequenceRef.current += 1;
      const normalized = parseFleetInput(defaultGraph);
      const options: FleetRunOptions = {
        tenant: tenantId,
        zone,
        graph: normalized,
        scripts: [
          compileWorkflowScript(
            `start stress ${tenantId} ${zone}\nnotify ${zone}\nvalidate route-${runSequenceRef.current}`,
            runSequenceRef.current,
          ).script.map((step) => `${step.verb} ${step.route}`).join('\n'),
        ],
        strategyInput: {
          tenant: tenantId as never,
          runId: `run-${tenantId}-${runSequenceRef.current}`,
          signals: [] as never,
          forecastScore: 0.72,
        },
      };
      const result = await executeFleet(options);
      setRuntimePlan((previous) => ({
        ...previous,
        manifest: {
          ...previous.manifest,
          tenant: tenantId,
        },
      }));
      dispatch({
        type: 'ready',
        result,
      });
      dispatch({
        type: 'observe',
      });
      return result;
    } catch (error) {
      withFailure(error instanceof Error ? error.message : String(error));
      return undefined;
    } finally {
      dispatch({ type: 'stop' });
    }
  }, [tenantId, zone, withFailure]);

  const observe = useCallback(async () => {
    dispatch({ type: 'boot' });
    try {
      const frames = await runObserver({
        tenant: tenantId,
        zone,
        mode: 'audit',
      });
      const labels = frames.map((frame) => `${frame.at}:${frame.action}:${frame.status}`);
      await inspectFleet({
        tenant: tenantId,
        zone,
        graph: parseFleetInput(defaultGraph),
        scripts: ['start\nwait\nvalidate', ...labels],
        strategyInput: {
          tenant: tenantId as never,
          runId: `observe-${tenantId}-${Date.now()}`,
          signals: [],
          forecastScore: 0.42 + labels.length / 100,
        },
      });
      dispatch({
        type: 'observe',
      });
    } catch (error) {
      withFailure(error instanceof Error ? error.message : String(error));
    }
  }, [tenantId, zone, withFailure]);

  const inspect = useCallback(async (): Promise<void> => {
    try {
      await inspectFleet({
        tenant: tenantId,
        zone,
        graph: parseFleetInput(defaultGraph),
        scripts: ['start\nwait\nvalidate'],
        strategyInput: {
          tenant: tenantId as never,
          runId: `inspect-${tenantId}-${Date.now()}`,
          signals: [] as never,
          forecastScore: 0.41,
        },
      });
      dispatch({
        type: 'observe',
      });
    } catch {
      withFailure('Inspection pipeline failed');
    }
  }, [tenantId, zone, withFailure]);

  return {
    manifest,
    state,
    runtimePlan,
    run,
    observe,
    inspect,
    dispatch,
    isBusy: state.loading,
    hasResult: state.result !== undefined,
    nodeCount: runtimePlan.graph.nodes.length,
    laneNames: runtimePlan.graph.nodes.map((node) => node.lane).filter((value, index, all) => all.indexOf(value) === index) as readonly WorkflowNode['lane'][],
  };
};
