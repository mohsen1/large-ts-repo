import { useCallback, useEffect, useMemo, useReducer, type ReactElement } from 'react';
import {
  asNamespace,
  asRun,
  asSession,
  asTenant,
} from '@domain/recovery-ecosystem-analytics';
import {
  summarizeRunDiagnostics,
  type PluginNode,
  type PluginRunInput,
  type PluginRunResult,
  pluginCatalogSeedNodes,
} from '@domain/recovery-ecosystem-analytics';
import { usePluginStudioService, type StudioSignal } from '../services/ecosystemPluginStudioService';
import { mapWithIteratorHelpers, type JsonValue } from '@shared/type-level';
import { type Result, ok, fail } from '@shared/result';

type StudioAction =
  | { readonly type: 'seed' }
  | { readonly type: 'signals-updated'; readonly payload: readonly StudioSignal[] }
  | { readonly type: 'catalog-updated'; readonly catalog: readonly PluginNode[] }
  | { readonly type: 'run-started'; readonly runId: string }
  | { readonly type: 'run-complete'; readonly runId: string }
  | { readonly type: 'diagnostics-updated'; readonly diagnostics: readonly string[] }
  | { readonly type: 'results-updated'; readonly results: readonly PluginRunResult[] }
  | { readonly type: 'error'; readonly message: string };

type StudioState = {
  readonly loading: boolean;
  readonly signals: readonly StudioSignal[];
  readonly runId: string;
  readonly diagnostics: readonly string[];
  readonly catalog: readonly string[];
  readonly results: readonly PluginRunResult[];
  readonly lastError: string | undefined;
  readonly session: string;
};

const defaultState: StudioState = {
  loading: false,
  signals: [],
  runId: '',
  diagnostics: [],
  catalog: [],
  results: [],
  lastError: undefined,
  session: asSession('studio:default').replace('session:', ''),
};

const reducer = (state: StudioState, action: StudioAction): StudioState => {
  switch (action.type) {
    case 'seed':
      return { ...state, loading: true, lastError: undefined };
    case 'signals-updated':
      return { ...state, signals: action.payload, loading: false };
    case 'catalog-updated':
      return { ...state, catalog: action.catalog.map((entry) => entry.name), loading: false };
    case 'run-started':
      return { ...state, loading: true, runId: action.runId, lastError: undefined };
    case 'run-complete':
      return { ...state, loading: false, runId: action.runId };
    case 'diagnostics-updated':
      return { ...state, diagnostics: action.diagnostics };
    case 'results-updated':
      return { ...state, results: action.results };
    case 'error':
      return { ...state, loading: false, lastError: action.message };
    default:
      return state;
  }
};

const normalizeSignalKind = (value: string): `signal:${string}` =>
  `signal:${value.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}`;

const toPluginInput = (signal: StudioSignal, runId: string): PluginRunInput => ({
  runId: asRun(runId),
  kind: normalizeSignalKind(signal.kind),
  namespace: asNamespace(`namespace:${signal.kind}`),
  at: new Date().toISOString(),
  value: signal.value,
  payload: signal.payload as JsonValue,
});

const buildContext = (tenant: string, namespace: string) => ({
  tenant: asTenant(tenant),
  namespace: asNamespace(namespace),
});

const toRunSummary = (results: readonly PluginRunResult[]): string => {
  const summary = summarizeRunDiagnostics(results);
  return `${results.length}::${summary.runMetrics.signalCount}::${summary.runMetrics.warningCount}::${summary.runMetrics.criticalCount}`;
};

const toResultPayload = (input: PluginRunInput): PluginRunResult => ({
  plugin: `plugin:${input.kind.replace('signal:', '')}` as const,
  accepted: true,
  signalCount: input.value,
  payload: {
    namespace: input.namespace,
    signal: input.kind,
    at: input.at,
  },
  diagnostics: [{ step: input.kind, latencyMs: 1 }],
});

export const useEcosystemPluginStudio = ({
  tenantId,
  namespace,
}: {
  readonly tenantId: string;
  readonly namespace: string;
}): {
  readonly state: StudioState;
  readonly setSignal: (signal: StudioSignal) => void;
  readonly clearSignals: () => void;
  readonly refreshCatalog: () => Promise<void>;
  readonly run: () => Promise<Result<{ readonly runId: string }>>;
  readonly runScenario: () => Promise<void>;
  readonly digest: ReactElement;
  readonly session: string;
} => {
  const service = usePluginStudioService(tenantId, namespace);
  const [state, dispatch] = useReducer(reducer, defaultState);

  const refreshCatalog = useCallback(async () => {
    dispatch({ type: 'seed' });
    try {
      dispatch({ type: 'catalog-updated', catalog: pluginCatalogSeedNodes });
      dispatch({ type: 'diagnostics-updated', diagnostics: [`catalog:${pluginCatalogSeedNodes.length}`] });
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : 'catalog-load-failed' });
    }
  }, []);

  const setSignal = useCallback(
    (signal: StudioSignal): void => {
      dispatch({
        type: 'signals-updated',
        payload: [...state.signals, signal].slice(-12),
      });
    },
    [state.signals],
  );

  const clearSignals = useCallback(() => {
    dispatch({ type: 'signals-updated', payload: [] });
    dispatch({ type: 'results-updated', results: [] });
  }, []);

  const run = useCallback(async () => {
    const runId = asRun(`studio:${tenantId}-${Date.now()}`).toString();
    dispatch({ type: 'run-started', runId });
    const context = buildContext(tenantId, namespace);
    const inputs = mapWithIteratorHelpers(state.signals, (signal) => toPluginInput(signal, runId));

    const startResult = await service.start(state.signals);
    if (!startResult.ok) {
      dispatch({ type: 'error', message: startResult.error.message });
      return fail(startResult.error);
    }

    const normalizedRunId = startResult.value.runId;
    dispatch({ type: 'run-complete', runId: normalizedRunId });
    const diagnostics = await service.diagnostics(normalizedRunId);
    if (diagnostics.ok) {
      dispatch({ type: 'diagnostics-updated', diagnostics: diagnostics.value });
    }

    const mapped = mapWithIteratorHelpers(inputs, (entry) => toResultPayload(entry));
    const summary = toRunSummary(mapped);
    dispatch({ type: 'results-updated', results: mapped });
    dispatch({
      type: 'diagnostics-updated',
      diagnostics: [...(diagnostics.ok ? diagnostics.value : []), `tenant:${context.tenant}`, `summary:${summary}`],
    });
    return ok({ runId: normalizedRunId });
  }, [namespace, state.signals, service, tenantId]);

  const runScenario = useCallback(async () => {
    const context = buildContext(tenantId, namespace);
    void context;
    const fallbackInputs = mapWithIteratorHelpers(state.signals, (signal) =>
      toPluginInput(signal, asRun(`studio-scenario:${state.signals.length}-${tenantId}`)),
    );
    const fallbackResults = mapWithIteratorHelpers(fallbackInputs, (entry) => toResultPayload(entry));
    const traces = mapWithIteratorHelpers(fallbackResults, (entry, index) => `${entry.plugin}:${entry.signalCount}:${index}`);
    const summary = toRunSummary(fallbackResults);
    dispatch({
      type: 'diagnostics-updated',
      diagnostics: [
        `tenant:${context.tenant}`,
        `signals:${state.signals.length}`,
        `trace:${traces.length}`,
        `summary:${summary}`,
      ],
    });
    dispatch({ type: 'results-updated', results: fallbackResults });
    await Promise.resolve(context);
  }, [state.signals, tenantId, namespace]);

  useMemo(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const digest = useMemo<ReactElement>(
    () => (
      <pre>
        {JSON.stringify({
          runId: state.runId,
          loading: state.loading,
          diagnostics: state.diagnostics,
          catalog: state.catalog.length,
          signals: state.signals.length,
          lastError: state.lastError,
        }, null, 2)}
      </pre>
    ),
    [state],
  );

  return {
    state,
    setSignal,
    clearSignals,
    refreshCatalog,
    run,
    runScenario,
    digest,
    session: asSession(`${tenantId}:${namespace}`),
  };
};

export const createStudioSession = (
  tenant: string,
  namespace: string,
  signals: readonly StudioSignal[],
): {
  readonly runId: ReturnType<typeof asRun>;
  readonly request: ReturnType<typeof buildContext>;
} => ({
  runId: asRun(`session:${tenant}`),
  request: buildContext(tenant, namespace),
});
