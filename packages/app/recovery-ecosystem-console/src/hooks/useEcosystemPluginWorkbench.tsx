import { useCallback, useMemo, useReducer, useState, type ReactNode } from 'react';
import { mapWithIteratorHelpers } from '@shared/type-level';
import type { JsonValue } from '@shared/type-level';
import type { PluginRunResult, PluginNode } from '@domain/recovery-ecosystem-analytics';
import { useEcosystemPluginStudio } from './useEcosystemPluginStudio';
import { createStudioRunInput, usePluginStudioService, type StudioSignal } from '../services/ecosystemPluginStudioService';

type WorkbenchPhase = 'seed' | 'prepared' | 'running' | 'reviewed';
type WorkbenchAction =
  | { readonly type: 'signals-updated'; readonly signals: readonly StudioSignal[] }
  | { readonly type: 'results-updated'; readonly results: readonly PluginRunResult[] }
  | { readonly type: 'catalog-updated'; readonly catalog: readonly string[] }
  | { readonly type: 'status-updated'; readonly status: string }
  | { readonly type: 'phase-updated'; readonly phase: WorkbenchPhase };

type WorkbenchState = {
  readonly loading: boolean;
  readonly phase: WorkbenchPhase;
  readonly signals: readonly StudioSignal[];
  readonly catalog: readonly string[];
  readonly results: readonly PluginRunResult[];
  readonly status: string;
};

interface WorkbenchPlan {
  readonly id: string;
  readonly count: number;
  readonly signatures: readonly string[];
}

interface WorkbenchDiagnostics {
  readonly catalogSize: number;
  readonly resultVolume: number;
  readonly phase: WorkbenchPhase;
  readonly matrix: readonly number[];
}

const defaultState: WorkbenchState = {
  loading: false,
  phase: 'seed',
  signals: [],
  catalog: [],
  results: [],
  status: 'boot',
};

const reducer = (state: WorkbenchState, action: WorkbenchAction): WorkbenchState => {
  switch (action.type) {
    case 'signals-updated':
      return { ...state, signals: action.signals };
    case 'results-updated':
      return { ...state, results: action.results };
    case 'catalog-updated':
      return { ...state, catalog: action.catalog };
    case 'status-updated':
      return { ...state, status: action.status };
    case 'phase-updated':
      return { ...state, phase: action.phase };
    default:
      return state;
  }
};

const buildSignature = (seed: string, index: number): string =>
  `sig:${seed}:${index}`.replace(/[^a-z0-9._-]/gi, '-');

const buildPlan = (signals: readonly StudioSignal[]): WorkbenchPlan => {
  const signatures = signals.map((signal, index) => buildSignature(signal.kind, index));
  return {
    id: `plan:${signatures.length}`,
    count: signals.length,
    signatures,
  };
};

const summarize = (results: readonly { readonly signalCount: number }[]): WorkbenchDiagnostics => {
  const matrix = mapWithIteratorHelpers(results, (result) => result.signalCount);
  return {
    catalogSize: results.length,
    resultVolume: matrix.reduce((acc, entry) => acc + entry, 0),
    phase: matrix.length > 0 ? 'reviewed' : 'seed',
    matrix,
  };
};

export const useEcosystemPluginWorkbench = ({
  tenantId,
  namespace,
}: {
  readonly tenantId: string;
  readonly namespace: string;
}): {
  readonly state: WorkbenchState & { readonly plan: WorkbenchPlan; readonly diagnostics: WorkbenchDiagnostics };
  readonly pluginNodes: readonly PluginNode[];
  readonly toPayload: (seed: string) => Record<string, JsonValue>;
  readonly actions: {
    readonly addSignal: (kind: string) => void;
    readonly run: () => Promise<void>;
    readonly runScenario: () => Promise<void>;
    readonly clear: () => void;
    readonly refreshCatalog: () => Promise<void>;
  };
  readonly renderSummary: () => ReactNode;
} => {
  const studio = useEcosystemPluginStudio({ tenantId, namespace });
  const service = usePluginStudioService(tenantId, namespace);
  const [state, dispatch] = useReducer(reducer, defaultState);

  const plan = useMemo(() => buildPlan(studio.state.signals), [studio.state.signals]);
  const diagnostics = useMemo(() => summarize(studio.state.results), [studio.state.results]);

  const pluginNodes = useMemo<readonly PluginNode[]>(
    () => studio.state.catalog.map((entry, index) => ({
      name: `plugin:${entry}` as const,
      namespace: `namespace:${namespace}` as const,
      kind: `plugin:${entry}` as const,
      dependsOn: [],
      inputKinds: [`in:${entry}` as const],
      outputKinds: [`out:${entry}` as const],
      weight: index + 1,
      signature: entry,
      version: 'v1' as const,
      run: async () => ({
        plugin: `plugin:${entry}`,
        accepted: true,
        signalCount: entry.length,
        payload: { entry },
        diagnostics: [{ step: entry, latencyMs: 2 }],
      }),
    })),
    [namespace, studio.state.catalog],
  );

  const toPayload = useCallback((seed: string): Record<string, JsonValue> => ({
    source: 'ecosystem-plugin-workbench',
    seed,
    count: seed.length,
    createdAt: new Date().toISOString(),
  }), []);

  const refreshCatalog = useCallback(async () => {
    dispatch({ type: 'phase-updated', phase: 'seed' });
    await studio.refreshCatalog();
    const load = await service.loadCatalog();
    dispatch({ type: 'catalog-updated', catalog: load.map((entry) => entry.name) });
    dispatch({ type: 'status-updated', status: `catalog-refreshed:${load.length}` });
  }, [studio, service]);

  const addSignal = useCallback((kind: string) => {
    const signal: StudioSignal = {
      kind,
      value: kind.length + plan.count,
      payload: toPayload(kind),
    };
    studio.setSignal(signal);
    dispatch({ type: 'signals-updated', signals: [...studio.state.signals, signal] });
    dispatch({ type: 'phase-updated', phase: 'prepared' });
    dispatch({ type: 'status-updated', status: `signal-added:${kind}` });
  }, [studio, plan, toPayload]);

  const run = useCallback(async () => {
    dispatch({ type: 'phase-updated', phase: 'running' });
    dispatch({ type: 'status-updated', status: 'run-started' });
    const payloads = studio.state.signals.map((entry) => ({
      kind: entry.kind,
      payload: entry.payload,
    }));
    const request = {
      tenant: tenantId,
      namespace,
      signals: payloads.map((entry) => ({
        kind: entry.kind,
        payload: entry.payload as JsonValue,
      })),
    };
    const scenario = await service.run(request);
    if (!scenario.ok) {
      dispatch({ type: 'status-updated', status: `run-failed:${scenario.error.message}` });
      dispatch({ type: 'phase-updated', phase: 'prepared' });
      return;
    }
    await Promise.resolve(createStudioRunInput(studio.state.signals, scenario.value.runId.toString()));
    const diagnostics = await service.diagnostics(scenario.value.runId);
    if (diagnostics.ok) {
      dispatch({ type: 'status-updated', status: `run:${diagnostics.value.length}` });
    }
    dispatch({
      type: 'results-updated',
      results: payloads.map((entry, index) => ({
        plugin: `plugin:${entry.kind}`,
        accepted: true,
        signalCount:
          typeof entry.payload === 'object' &&
          entry.payload !== null &&
          typeof (entry.payload as { readonly value?: unknown }).value === 'number'
            ? ((entry.payload as { readonly value: number }).value)
            : index,
        payload: entry.payload,
        diagnostics: [{ step: entry.kind, latencyMs: index }],
      })),
    });
    dispatch({ type: 'phase-updated', phase: 'reviewed' });
  }, [studio.state.signals, namespace, tenantId, service, plan.count]);

  const runScenario = useCallback(async () => {
    await studio.runScenario();
    dispatch({ type: 'phase-updated', phase: 'reviewed' });
  }, [studio]);

  const clear = useCallback(() => {
    studio.clearSignals();
    dispatch({ type: 'signals-updated', signals: [] });
    dispatch({ type: 'results-updated', results: [] });
    dispatch({ type: 'phase-updated', phase: 'seed' });
    dispatch({ type: 'status-updated', status: 'cleared' });
  }, [studio]);

  const renderSummary = useCallback(
    () => (
      <section>
        <h4>Workbench</h4>
        <pre>{JSON.stringify({ tenantId, namespace, plan, diagnostics, status: state.status }, null, 2)}</pre>
      </section>
    ),
    [diagnostics, namespace, plan, state.status, tenantId],
  );

  return {
    state: {
      ...state,
      plan,
      diagnostics,
    },
    pluginNodes,
    toPayload,
    actions: {
      addSignal,
      run,
      runScenario,
      clear,
      refreshCatalog,
    },
    renderSummary,
  };
};
