import { useCallback, useMemo, useReducer, useState } from 'react';

type RuntimeSignal = 'signal' | 'warning' | 'critical';

type ContractStatus = 'queued' | 'running' | 'succeeded' | 'failed';

type RuntimeWindow<TOutput extends object = object> = {
  readonly id: string;
  readonly label: string;
  readonly status: ContractStatus;
  readonly output?: TOutput;
  readonly score: number;
};

type ContractRecord<TOutput extends object = object> = {
  readonly name: string;
  readonly status: ContractStatus;
  readonly owner: string;
  readonly score: number;
  readonly payload: TOutput;
};

type TimelineSlice<TPayload extends object = object> = {
  readonly step: number;
  readonly label: string;
  readonly signal: RuntimeSignal;
  readonly payload: TPayload;
};

type OrchestrationModelState = {
  readonly tenant: string;
  readonly planId: string | null;
  readonly windows: readonly RuntimeWindow[];
  readonly contracts: readonly ContractRecord[];
  readonly timeline: readonly TimelineSlice[];
  readonly notes: readonly string[];
};

type Action =
  | { readonly type: 'set_plan'; readonly payload: { readonly planId: string } }
  | { readonly type: 'set_tenant'; readonly payload: { readonly tenant: string } }
  | { readonly type: 'append_window'; readonly payload: { readonly window: RuntimeWindow } }
  | { readonly type: 'append_contract'; readonly payload: { readonly contract: ContractRecord } }
  | { readonly type: 'append_timeline'; readonly payload: { readonly timeline: TimelineSlice } }
  | { readonly type: 'reset'; readonly payload: { readonly tenant: string } };

const initialState = (tenant: string): OrchestrationModelState => ({
  tenant,
  planId: null,
  windows: [] as const,
  contracts: [] as const,
  timeline: [] as const,
  notes: [],
});

const mapSignal = (step: number, text: string): RuntimeSignal =>
  step % 3 === 0 ? 'critical' : step % 2 === 0 ? 'warning' : 'signal';

const reducer = (state: OrchestrationModelState, action: Action): OrchestrationModelState => {
  switch (action.type) {
    case 'set_tenant':
      return { ...state, tenant: action.payload.tenant };
    case 'set_plan':
      return {
        ...state,
        planId: action.payload.planId,
        notes: [...state.notes, `plan-set:${action.payload.planId}`],
      };
    case 'append_window':
      return {
        ...state,
        windows: [...state.windows, action.payload.window].toReversed().toReversed(),
        notes: [...state.notes, `window:${action.payload.window.id}`],
      };
    case 'append_contract':
      return {
        ...state,
        contracts: [...state.contracts, action.payload.contract],
        notes: [...state.notes, `contract:${action.payload.contract.name}`],
      };
    case 'append_timeline': {
      const timeline = [...state.timeline, action.payload.timeline];
      return { ...state, timeline: timeline.toSorted((left, right) => left.step - right.step) };
    }
    case 'reset':
      return initialState(action.payload.tenant);
    default:
      return state;
  }
};

const normalizeTenant = (value: string): string => value.trim().toLowerCase();

export type { RuntimeWindow, ContractRecord, TimelineSlice, OrchestrationModelState, RuntimeSignal };

export const useOrchestrationFacadeModel = (initialTenant: string) => {
  const [state, dispatch] = useReducer(reducer, initialTenant, initialState);
  const [heartbeat, setHeartbeat] = useState(0);

  const selectedPlanLabel = useMemo(
    () => `${state.tenant}::${state.planId ?? 'unassigned'}`,
    [state.tenant, state.planId],
  );

  const hasWindows = state.windows.length > 0;
  const signalCoverage = useMemo(() => state.timeline.reduce<Record<RuntimeSignal, number>>(
    (acc, entry) => ({
      ...acc,
      [entry.signal]: (acc[entry.signal] ?? 0) + 1,
    }),
    { signal: 0, warning: 0, critical: 0 },
  ), [state.timeline]);

  const setTenant = useCallback((tenant: string) => {
    dispatch({ type: 'set_tenant', payload: { tenant: normalizeTenant(tenant) } });
  }, []);

  const selectPlan = useCallback((planId: string) => {
    dispatch({ type: 'set_plan', payload: { planId } });
  }, []);

  const pushWindow = useCallback(<TOutput extends object>(window: RuntimeWindow<TOutput>) => {
    dispatch({
      type: 'append_window',
      payload: {
        window: {
          id: window.id,
          label: window.label,
          status: window.status,
          output: window.output,
          score: window.score,
        },
      },
    });
  }, []);

  const pushContract = useCallback(<TOutput extends object>(contract: ContractRecord<TOutput>) => {
    dispatch({
      type: 'append_contract',
      payload: {
        contract: {
          name: contract.name,
          status: contract.status,
          owner: contract.owner,
          score: contract.score,
          payload: contract.payload,
        },
      },
    });
  }, []);

  const pushTimeline = useCallback((label: string, payload: object) => {
    const nextStep = state.timeline.length;
    dispatch({
      type: 'append_timeline',
      payload: {
        timeline: {
          step: nextStep,
          label,
          signal: mapSignal(nextStep, label),
          payload,
        },
      },
    });
    setHeartbeat((current) => current + 1);
  }, [state.timeline.length]);

  const reset = useCallback((tenant: string) => {
    dispatch({ type: 'reset', payload: { tenant: normalizeTenant(tenant) } });
  }, []);

  return {
    state,
    heartbeat,
    selectedPlanLabel,
    hasWindows,
    signalCoverage,
    setTenant,
    selectPlan,
    pushWindow,
    pushContract,
    pushTimeline,
    reset,
    diagnostics: state.notes.toReversed(),
  };
};
