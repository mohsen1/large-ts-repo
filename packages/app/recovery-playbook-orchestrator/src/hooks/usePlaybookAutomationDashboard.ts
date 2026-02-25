import { useCallback, useEffect, useMemo, useRef, useReducer } from 'react';
import { createDefaultAuditJournal } from '@data/recovery-playbook-automation-store';
import {
  type BlueprintTemplate,
  createPhaseSequence,
  type PlaybookAutomationRunId,
  type PlaybookAutomationSessionId,
} from '@domain/recovery-playbook-orchestration-core';
import {
  PlaybookAutomationSession,
  runSimulationFromPlan,
} from '@service/recovery-playbook-automation-engine';
import { fail, ok, type Result } from '@shared/result';

type DashboardAction =
  | { type: 'loading' }
  | { type: 'loaded'; payload: { sessionId: PlaybookAutomationSessionId } }
  | { type: 'history'; payload: { plans: readonly PlaybookAutomationRunId[]; history: readonly string[] } }
  | { type: 'error'; payload: string }
  | { type: 'reset' };

interface DashboardState {
  readonly tenantId: string;
  readonly loading: boolean;
  readonly sessionId?: PlaybookAutomationSessionId;
  readonly plans: readonly PlaybookAutomationRunId[];
  readonly history: readonly string[];
  readonly errors: readonly string[];
  readonly isHydrated: boolean;
}

const reducer = (state: DashboardState, action: DashboardAction): DashboardState => {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true };
    case 'loaded':
      return { ...state, loading: false, sessionId: action.payload.sessionId, isHydrated: true };
    case 'history':
      return {
        ...state,
        loading: false,
        plans: action.payload.plans,
        history: [...state.history, ...action.payload.history],
      };
    case 'error':
      return {
        ...state,
        loading: false,
        errors: [...state.errors, action.payload],
      };
    case 'reset':
      return {
        tenantId: state.tenantId,
        loading: false,
        plans: [],
        history: [],
        errors: [],
        isHydrated: false,
        sessionId: undefined,
      };
    default:
      return state;
  }
};

interface DashboardProps {
  readonly tenantId: string;
  readonly template: BlueprintTemplate;
}

export interface AutomationSnapshot {
  readonly sessionId?: string;
  readonly planCount: number;
  readonly history: readonly string[];
  readonly phaseTrail: readonly string[];
}

const summarizeError = (value: unknown): string => {
  if (value instanceof Error) return value.message;
  return String(value);
};

export const usePlaybookAutomationDashboard = ({ tenantId, template }: DashboardProps) => {
  const [state, dispatch] = useReducer(reducer, {
    tenantId,
    loading: false,
    plans: [],
    history: [],
    errors: [],
    isHydrated: false,
  });

  const sessionRef = useRef<PlaybookAutomationSession | null>(null);

  const phases = useMemo(
    () => createPhaseSequence(['initialized', 'enqueued', 'simulated', 'executing', 'audited', 'finished']),
    [],
  );

  const boot = useCallback(async (): Promise<Result<PlaybookAutomationSessionId, string>> => {
    dispatch({ type: 'loading' });
    const journal = await createDefaultAuditJournal();
    if (!journal.ok) {
      const message = journal.error;
      dispatch({ type: 'error', payload: message });
      return fail(message);
    }

    const created = await PlaybookAutomationSession.create(journal.value, { tenantId });
    if (!created.ok) {
      dispatch({ type: 'error', payload: created.error });
      return fail(created.error);
    }

    sessionRef.current = created.value;
    dispatch({ type: 'loaded', payload: { sessionId: created.value.state.sessionId } });
    dispatch({ type: 'history', payload: { plans: created.value.state.runs, history: ['boot-complete'] } });
    return ok(created.value.state.sessionId);
  }, [tenantId]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const hydratePlan = useCallback(async () => {
    const session = sessionRef.current;
    if (!session?.state.sessionId) return;

    dispatch({ type: 'loading' });
    const seed = template.constraints.length > 0 ? template.constraints : [];
    const hydrated = await session.hydrate(template, seed);
    if (!hydrated.ok) {
      dispatch({ type: 'error', payload: summarizeError(hydrated.error) });
      return;
    }

    dispatch({
      type: 'history',
      payload: {
        plans: [...session.state.runs],
        history: [`hydrated:${session.state.sessionId}`, `run:${hydrated.value}`],
      },
    });
  }, [template]);

  const runPlan = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      await boot();
      return;
    }

    dispatch({ type: 'loading' });
    const next = await runSimulationFromPlan(session, template);
    if (!next.ok) {
      dispatch({ type: 'error', payload: summarizeError(next.error) });
      return;
    }

    dispatch({
      type: 'history',
      payload: {
        plans: [...session.state.runs],
        history: [`run:${next.value}`],
      },
    });
  }, [boot, template]);

  return {
    phases,
    hydration: {
      loading: state.loading,
      isHydrated: state.isHydrated,
      errors: state.errors,
      plans: state.plans,
      history: state.history,
      sessionId: state.sessionId,
    },
    actions: {
      boot,
      hydratePlan,
      runPlan,
      reset: () => dispatch({ type: 'reset' }),
    },
  };
};

export const summarizeAutomation = (session: DashboardState): AutomationSnapshot => ({
  sessionId: session.sessionId,
  planCount: session.plans.length,
  history: session.history,
  phaseTrail: ['initialized', 'queued', 'finished'],
});
