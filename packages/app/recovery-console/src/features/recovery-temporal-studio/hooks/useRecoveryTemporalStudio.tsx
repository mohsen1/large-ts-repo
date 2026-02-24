import { useCallback, useMemo, useReducer } from 'react';
import {
  createEmptyTimeline,
  type TemporalStudioAction,
  type TemporalStudioMode,
  type TemporalStudioRow,
  type TemporalStudioState,
  type TemporalTimelineEntry,
  formatTenant,
  type TemporalStudioRowView,
  toRowView,
} from '../types';
import { createTemporalStudioAdapter } from '../adapter';
import type { RuntimeOrchestrationOptions } from '@service/recovery-temporal-orchestrator';
import type { Brand } from '@shared/temporal-ops-runtime';

const adapter = createTemporalStudioAdapter();

const reduce = (state: TemporalStudioState, action: TemporalStudioAction): TemporalStudioState => {
  switch (action.type) {
    case 'hydrate':
      return {
        ...state,
        loading: false,
      };
    case 'set-rows': {
      const rows = action.payload as TemporalStudioRow[];
      return {
        ...state,
        rows,
      };
    }
    case 'set-timeline': {
      return {
        ...state,
        timeline: action.payload as TemporalTimelineEntry[],
      };
    }
    case 'set-mode':
      return {
        ...state,
        mode: action.payload as TemporalStudioMode,
      };
    case 'set-selected':
      return {
        ...state,
        selectedRun: action.payload as TemporalStudioState['selectedRun'],
      };
    default:
      return state;
  }
};

const baseState: TemporalStudioState = {
  rows: [],
  timeline: createEmptyTimeline(),
  loading: false,
  mode: 'plan',
  diagnostics: {
    runCount: 0,
    hasData: false,
  },
};

export const createTemporalRows = (rows: readonly TemporalStudioRow[]): readonly TemporalStudioRowView[] =>
  rows
    .toSorted((left, right) => left.triggeredAt.localeCompare(right.triggeredAt))
    .map(toRowView);

export const useRecoveryTemporalStudio = () => {
  const [state, dispatch] = useReducer(reduce, baseState);

  const diagnostics = useMemo(() => state.diagnostics, [state.diagnostics]);

  const hydrate = useCallback(async (tenant: string): Promise<void> => {
    dispatch({ type: 'hydrate' });
    const resolved = await adapter.listDiagnostics(formatTenant(tenant));
    const timeline = await adapter.loadTimeline(formatTenant(tenant));

    const rows: TemporalStudioRow[] = [
      {
        runId: `run:${tenant}:0` as Brand<string, 'RunId'>,
        tenant,
        actor: 'studio',
        candidateNames: ['alpha', 'beta'],
        planName: `plan:${tenant}:bootstrap`,
        mode: 'runtime',
        triggeredAt: new Date().toISOString() as TemporalTimelineEntry['startedAt'],
      },
    ];

    dispatch({ type: 'set-rows', payload: rows });
    dispatch({ type: 'set-timeline', payload: timeline });
    dispatch({ type: 'set-mode', payload: 'runtime' });
    dispatch({
      type: 'hydrate',
      payload: {
        runCount: resolved.runCount,
        hasData: resolved.hasData,
      },
    });
  }, []);

  const runPlan = useCallback(async (options: RuntimeOrchestrationOptions): Promise<void> => {
    const result = await adapter.runPlan(options);
    const row: TemporalStudioRow = {
      runId: result.runId,
      tenant: result.tenant,
      actor: 'service',
      candidateNames: ['alpha', 'beta', 'gamma'],
      planName: `${options.planName}::${options.actor}`,
      mode: 'signals',
      triggeredAt: new Date().toISOString() as TemporalTimelineEntry['startedAt'],
    };

    dispatch({ type: 'set-rows', payload: [...state.rows, row] });
    dispatch({
      type: 'set-timeline',
      payload: [
        {
          stage: 'runtime',
          state: 'active',
          startedAt: new Date().toISOString() as TemporalTimelineEntry['startedAt'],
          message: `execution ${result.runId} telemetry=${result.telemetryCount}`,
        },
      ],
    });
  }, [state.rows]);

  const setMode = useCallback((mode: TemporalStudioMode) => {
    dispatch({ type: 'set-mode', payload: mode });
  }, []);

  const setSelectedRun = useCallback((runId?: TemporalStudioRow['runId']) => {
    dispatch({ type: 'set-selected', payload: runId });
  }, []);

  const rowsView = useMemo(() => createTemporalRows(state.rows), [state.rows]);

  return {
    state,
    runPlan,
    hydrate,
    setMode,
    setSelectedRun,
    diagnostics,
    rowsView,
  };
};
