import { useCallback, useMemo, useState } from 'react';
import type {
  OrchestratorEnvelope,
  OrchestratorState,
  OrchestrationInput,
  OrchestrationRunId,
  OrchestratorAdapterBundle,
} from '@service/recovery-synthesis-orchestrator';
import {
  type SynthesisPanelMode,
  type SynthesisPanelState,
  type SynthesisWorkspaceSnapshot,
  type SynthesisAction,
} from '../types/synthesis';
import { RecoverySynthesisOrchestrator } from '@service/recovery-synthesis-orchestrator';

const createDummyAdapters = (): OrchestratorAdapterBundle => {
  const history: OrchestratorState[] = [];
  return {
    storage: {
      save: async (model) => {
        void model;
      },
      load: async () => undefined,
    },
    publisher: {
      publish: async () => {},
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
};

export const useRecoverySynthesis = () => {
  const [state, setState] = useState<SynthesisPanelState>({
    mode: 'plan',
    signals: [],
    constraints: [],
    loading: false,
  });

  const [orchestratorState, setOrchestratorState] = useState<OrchestratorState>({
    planHistory: [],
    activeSignals: [],
  });

  const runHistory = useMemo(() => orchestratorState.planHistory, [orchestratorState.planHistory]);
  const actions = useMemo<SynthesisAction[]>(() => {
    const base: SynthesisAction = {
      name: 'New scenario',
      description: 'Start a fresh recovery synthesis flow',
      disabled: state.loading,
    };
    const simulate: SynthesisAction = {
      name: 'Run simulation',
      description: 'Simulate the active plan and inspect risk',
      disabled: !state.envelope || state.loading,
    };
    const execute: SynthesisAction = {
      name: 'Approve and execute',
      description: 'Approve the active plan for execution',
      disabled: state.mode !== 'review' || !state.plan || state.loading,
    };
    return [base, simulate, execute];
  }, [state.loading, state.envelope, state.mode, state.plan]);

  const orchestrator = useMemo(() => new RecoverySynthesisOrchestrator(createDummyAdapters()), []);

  const withLoading = useCallback(async <T,>(runner: () => Promise<T>) => {
    setState((previous) => ({ ...previous, loading: true }));
    try {
      return await runner();
    } finally {
      setState((previous) => ({ ...previous, loading: false }));
    }
  }, []);

  const runScenario = useCallback(async (input: OrchestrationInput) => {
    const envelope = await withLoading(async () =>
      orchestrator.orchestrate(input),
    );
    setState((current) => ({
      ...current,
      mode: 'simulate',
      runId: envelope.runId,
      envelope,
      blueprint: input.blueprint,
      constraints: input.constraints,
      signals: input.signals,
      loading: false,
    }));
    const snapshot = await orchestrator.snapshot();
    setOrchestratorState(snapshot.envelope ? ({ ...orchestratorState, currentRun: snapshot.envelope, planHistory: [...orchestratorState.planHistory, snapshot.envelope.runId] }) : orchestratorState);
  }, [withLoading, orchestrator, orchestratorState]);

  const simulatePlan = useCallback(async (planId: OrchestrationRunId) => {
    if (!state.envelope) {
      setState((current) => ({ ...current, error: `No envelope available for run ${planId}` }));
      return;
    }
    if (!state.envelope.model.activePlan) {
      setState((current) => ({ ...current, error: 'No active plan to simulate' }));
      return;
    }
    const output = await withLoading(async () => orchestrator.simulate(state.envelope?.model.activePlan!));
    setState((current) => ({
      ...current,
      mode: 'review',
      simResult: output.simulation,
      plan: output.plan,
      loading: false,
    }));
  }, [withLoading, orchestrator, state.envelope]);

  const snapshot = useMemo<SynthesisWorkspaceSnapshot>(() => ({
    state,
    orchestratorState,
  }), [state, orchestratorState]);

  return {
    ...snapshot,
    actions,
    runHistory,
    runScenario,
    simulatePlan,
  };
};
