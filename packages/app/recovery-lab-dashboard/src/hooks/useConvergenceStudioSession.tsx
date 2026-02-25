import { useCallback, useMemo, useReducer, useState } from 'react';
import {
  createRuntime,
  type ConvergenceRuntime,
  runtimeFactory,
  withRuntime,
} from '@service/recovery-ops-orchestration-engine';
import type { ConvergenceRunMode, ConvergenceRunOutput, RuntimeCheckpoint } from '@service/recovery-ops-orchestration-engine/src/convergence-runtime/types';
import {
  ConvergencePluginDescriptor,
  ConvergenceStudioId,
  normalizeConvergenceTag,
  normalizePluginId,
  normalizeStudioId,
  normalizeTemplateName,
} from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/types';

type SessionState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly payload: ConvergenceRunOutput }
  | { readonly status: 'error'; readonly message: string };

type SessionAction =
  | { readonly type: 'start' }
  | { readonly type: 'success'; readonly payload: ConvergenceRunOutput }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'reset' };

const reducer = (state: SessionState, action: SessionAction): SessionState => {
  switch (action.type) {
    case 'start': {
      return { status: 'loading' };
    }
    case 'success': {
      return { status: 'ready', payload: action.payload };
    }
    case 'error': {
      return { status: 'error', message: action.message };
    }
    case 'reset': {
      return { status: 'idle' };
    }
    default: {
      return state;
    }
  }
};

const defaultState: SessionState = { status: 'idle' };

type HookOptions = {
  readonly tenant: string;
  readonly mode?: ConvergenceRunMode;
};

type HookShape = {
  readonly state: SessionState;
  readonly start: () => Promise<void>;
  readonly checkpoints: readonly RuntimeCheckpoint[];
  readonly pluginDigest: string;
  readonly reset: () => void;
};

const normalizeTenantId = (value: string): ConvergenceStudioId => normalizeStudioId(`tenant:${value}`);
const normalizePluginTemplate = (value: string): ConvergencePluginDescriptor['template'] =>
  value as ConvergencePluginDescriptor['template'];

const createDemoPlugins = (tenant: ConvergenceStudioId): readonly ConvergencePluginDescriptor[] => {
  return [
    {
      id: normalizePluginId(`${tenant}:discover`),
      name: 'discovery-plugin',
      stage: 'discover',
      facets: ['planner'],
      template: normalizePluginTemplate(`${tenant}-tpl`),
      priority: 14,
      dependsOn: [],
      config: {
        tenant,
      },
      run: async () => ({
        plugin: 'discovery',
        stage: 'discover',
        elapsedMs: 12,
        tags: [normalizeConvergenceTag('discover')],
      }),
    },
    {
      id: normalizePluginId(`${tenant}:evaluate`),
      name: 'evaluation-plugin',
      stage: 'evaluate',
      facets: ['advisor'],
      template: normalizePluginTemplate(`${tenant}-tpl`),
      priority: 21,
      dependsOn: [normalizePluginId(`${tenant}:discover`)],
      config: { tenant },
      run: async () => ({
        plugin: 'evaluation',
        stage: 'evaluate',
        elapsedMs: 17,
        tags: [normalizeConvergenceTag('evaluate')],
      }),
    },
  ];
};

const toCheckpoint = (value: RuntimeCheckpoint, index: number): RuntimeCheckpoint => ({
  runId: value.runId,
  label: `${index}-${value.label}`,
  value: value.value,
});

export const useConvergenceStudioSession = ({ tenant, mode = 'live' }: HookOptions): HookShape => {
  const [state, dispatch] = useReducer(reducer, defaultState);
  const [checkpoints, setCheckpoints] = useState<readonly RuntimeCheckpoint[]>([]);

  const pluginDigest = useMemo(() => {
    const pattern = /^tenant-(?<name>[a-z0-9-]+):(?<mode>live|dry-run|replay)$/u;
    const match = pattern.exec(`tenant-${tenant}:live`);
    const suffix = match?.groups?.name ?? tenant;
    return `digest:${suffix}`;
  }, [tenant]);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
    setCheckpoints([]);
  }, []);

  const start = useCallback(async () => {
    dispatch({ type: 'start' });
    try {
      const { facade } = await runtimeFactory();
      const studioId = normalizeTenantId(tenant);
      const pluginDescriptors = createDemoPlugins(studioId);

      const runtime = createRuntime({
        facade,
      });
      const output = await withRuntime(facade, async (sharedRuntime: ConvergenceRuntime) => {
        const result = await sharedRuntime.run({
          studioId,
          requestedBy: tenant,
          plugins: pluginDescriptors,
          lifecycle: 'running',
          mode,
          labels: ['lab-dashboard', tenant],
        });
        const checkpoint: RuntimeCheckpoint = {
          runId: result.payload.runId,
          label: 'completed',
          value: { report: result.report },
        };
        setCheckpoints((previous) => [toCheckpoint(checkpoint, previous.length)]);
        return result;
      });
      dispatch({ type: 'success', payload: output });
    } catch (error) {
      dispatch({
        type: 'error',
        message: error instanceof Error ? error.message : 'unexpected-convergence-error',
      });
    }
  }, [tenant, mode]);

  return { state, start, checkpoints, pluginDigest, reset };
};
