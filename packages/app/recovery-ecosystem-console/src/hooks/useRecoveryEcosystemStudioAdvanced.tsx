import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useEcosystemPluginStudio } from './useEcosystemPluginStudio';
import { mapWithIteratorHelpers, type JsonValue } from '@shared/type-level';
import { buildStudioPlan, type StudioSignal } from '../services/ecosystemPluginStudioService';
import { summarizeRunDiagnostics, type PluginRunResult } from '@domain/recovery-ecosystem-analytics';

type MatrixRow = { readonly label: string; readonly value: number };
type ScenarioIntent = 'plan' | 'run' | 'simulate';

export interface StudioAdvancedState {
  readonly planId: string;
  readonly matrix: readonly MatrixRow[];
  readonly diagnostics: readonly string[];
  readonly intents: readonly ScenarioIntent[];
  readonly summary: string;
}

export interface StudioAdvancedAction {
  readonly type: 'refresh';
  readonly seed: readonly StudioSignal[];
}

const buildMatrixRows = (results: readonly PluginRunResult[]): readonly MatrixRow[] =>
  mapWithIteratorHelpers(results, (entry, index) => ({
    label: `${index}:${entry.plugin}`,
    value: entry.signalCount,
  }));

const summarizeDiagnostics = (results: readonly PluginRunResult[]): string => {
  const summary = summarizeRunDiagnostics(results);
  return `${summary.runMetrics.signalCount}:${summary.runMetrics.warningCount}:${summary.runMetrics.criticalCount}`;
};

const toSummaryLine = (row: MatrixRow): string => `${row.label}=${row.value}`;
const normalizeWeight = (entry: MatrixRow): number => (entry.value % 13) + 1;

const reduceIntents = (seeds: readonly StudioSignal[]): readonly ScenarioIntent[] =>
  seeds.map((seed) => (seed.value > 50 ? 'run' : 'simulate' as ScenarioIntent)).concat(['plan']);

export const useRecoveryEcosystemStudioAdvanced = ({
  tenantId,
  namespace,
}: {
  readonly tenantId: string;
  readonly namespace: string;
}): {
  readonly state: StudioAdvancedState;
  readonly actions: {
    readonly appendSignal: (seed: string, payload: Record<string, JsonValue>) => void;
    readonly clearSignals: () => void;
    readonly execute: () => Promise<void>;
    readonly simulate: () => Promise<void>;
  };
  readonly renderPanel: () => ReactNode;
} => {
  const studio = useEcosystemPluginStudio({ tenantId, namespace });
  const [state, setState] = useState<StudioAdvancedState>({
    planId: 'studio:boot',
    matrix: [],
    diagnostics: [],
    intents: [],
    summary: 'init',
  });
  const [signals, setSignals] = useState<readonly StudioSignal[]>([]);

  const appendSignal = useCallback((seed: string, payload: Record<string, JsonValue>) => {
    const signal: StudioSignal = {
      kind: seed,
      value: Object.keys(payload).length + seed.length,
      payload,
    };
    studio.setSignal(signal);
    setSignals((previous) => {
      const next = [...previous, signal];
      setState((current) => ({ ...current, intents: reduceIntents(next) }));
      return next;
    });
  }, [studio]);

  const refresh = useCallback(async () => {
    const plan = buildStudioPlan(signals);
    const matrix = mapWithIteratorHelpers(signals, (signal, index) => ({
      label: `matrix:${signal.kind}:${index}`,
      value: signal.value + plan.diagnostics.length,
    }));
    const normalized = mapWithIteratorHelpers(signals, (signal) => ({
      label: signal.kind,
      value: normalizeWeight({ label: signal.kind, value: signal.value }),
    }));

    setState((current) => ({
      ...current,
      planId: plan.id,
      matrix: matrix.length > 0 ? matrix : normalized,
      diagnostics: plan.diagnostics,
      summary: `${plan.id}:${signals.length}`,
    }));
  }, [signals]);

  const execute = useCallback(async () => {
    await refresh();
    const result = await studio.run();
    if (!result.ok) {
      setState((current) => ({ ...current, summary: `failed:${result.error.message}` }));
      return;
    }

    const rows = buildMatrixRows(studio.state.results);
    const diagnostics = mapWithIteratorHelpers(studio.state.results, (entry) => toSummaryLine({
      label: entry.plugin,
      value: entry.signalCount,
    }));
    setState((current) => ({
      ...current,
      matrix: rows,
      diagnostics: [...current.diagnostics, ...diagnostics],
      summary: summarizeDiagnostics(studio.state.results),
    }));
  }, [refresh, studio]);

  const simulate = useCallback(async () => {
    await studio.runScenario();
    setState((current) => ({
      ...current,
      diagnostics: [...current.diagnostics, `simulate:${signals.length}`],
      summary: 'simulation-finished',
    }));
  }, [studio, signals.length]);

  const clearSignals = useCallback(() => {
    setSignals([]);
    studio.clearSignals();
    setState({
      planId: `studio:clear:${Date.now()}`,
      matrix: [],
      diagnostics: [],
      intents: [],
      summary: 'cleared',
    });
  }, [studio]);

  useMemo(() => {
    void refresh();
  }, [refresh]);

  const renderPanel = useCallback(() => (
    <section>
      <h4>{state.planId}</h4>
      <pre>{JSON.stringify(state.matrix, null, 2)}</pre>
      <pre>{JSON.stringify({ ...studio.state, summary: state.summary }, null, 2)}</pre>
    </section>
  ), [state, studio.state]);

  return {
    state: {
      ...state,
      diagnostics: state.diagnostics.length > 0 ? state.diagnostics : studio.state.diagnostics,
    },
    actions: {
      appendSignal,
      clearSignals,
      execute,
      simulate,
    },
    renderPanel,
  };
};
