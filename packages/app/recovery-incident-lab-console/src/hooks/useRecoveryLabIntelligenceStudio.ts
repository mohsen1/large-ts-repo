import { useCallback, useEffect, useMemo, useReducer } from 'react';
import {
  buildSignalMatrix,
  matrixTopLanes,
  matrixSummaryScore,
  resolveMode,
  resolveLane,
  summarizeMatrix,
  summarizeWorkbenchSignals,
  workbenchTuple,
  type SignalEvent,
  type StrategyLane,
  type StrategyMode,
} from '@domain/recovery-lab-intelligence-core';
import { runIntelligencePlan, type ServiceRunEnvelope } from '@domain/recovery-lab-intelligence-core';

type SessionRecord = {
  readonly route: string;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
  readonly score: number;
  readonly tuple: readonly [StrategyMode, StrategyLane, string, number];
  readonly matrixRoute: string;
  readonly seedTag: string;
};

type StudioState = {
  readonly workspace: string;
  readonly scenario: string;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
  readonly status: 'idle' | 'running' | 'ready' | 'failed';
  readonly sessions: readonly SessionRecord[];
  readonly matrixSources: readonly SignalEvent[];
};

type StudioAction =
  | { type: 'setWorkspace'; workspace: string }
  | { type: 'setScenario'; scenario: string }
  | { type: 'setMode'; mode: StrategyMode }
  | { type: 'setLane'; lane: StrategyLane }
  | { type: 'appendBootstrapSignals'; events: readonly SignalEvent[] }
  | {
      type: 'setSessions';
      sessions: readonly SessionRecord[];
      matrix: readonly SignalEvent[];
      status: StudioState['status'];
    }
  | { type: 'setStatus'; status: StudioState['status'] }
  | { type: 'clear' };

type ScoreBar = {
  readonly width: `${number}%`;
  readonly color: `#${string}`;
  readonly score: number;
};

const initialState: StudioState = {
  workspace: 'lab-workspace-core',
  scenario: 'incident-lab-intelligence',
  mode: 'analyze',
  lane: 'forecast',
  status: 'idle',
  sessions: [],
  matrixSources: [],
};

const reducer = (state: StudioState, action: StudioAction): StudioState => {
  switch (action.type) {
    case 'setWorkspace':
      return { ...state, workspace: action.workspace };
    case 'setScenario':
      return { ...state, scenario: action.scenario };
    case 'setMode':
      return { ...state, mode: action.mode };
    case 'setLane':
      return { ...state, lane: action.lane };
    case 'setSessions':
      return {
        ...state,
        sessions: action.sessions,
        matrixSources: action.matrix,
        status: action.status,
      };
    case 'appendBootstrapSignals':
      return {
        ...state,
        matrixSources: [...state.matrixSources, ...action.events].toSorted((left, right) => right.at.localeCompare(left.at)),
      };
    case 'setStatus':
      return { ...state, status: action.status };
    case 'clear':
      return {
        ...state,
        sessions: [],
        matrixSources: [],
        status: 'idle',
      };
    default:
      return state;
  }
};

const normalizeMode = (mode: string): StrategyMode => resolveMode(mode);
const normalizeLane = (lane: string): StrategyLane => resolveLane(lane);

const palette = ['#22d3ee', '#a78bfa', '#f59e0b', '#4ade80', '#f472b6', '#60a5fa'] as const;

const resolveScoreBars = (sessions: readonly SessionRecord[]): readonly ScoreBar[] => {
  const ordered = [...sessions].toSorted((left, right) => right.score - left.score);
  const top = ordered.slice(0, 12);
  const max = top[0]?.score ?? 1;

  return top.map((entry, index) => {
    const normalized = Math.round((entry.score / max) * 100);
    return {
      width: `${Math.max(0, Math.min(100, normalized))}%` as `${number}%`,
      color: palette[index % palette.length],
      score: entry.score,
    } satisfies ScoreBar;
  });
};

const runTupleForModeLane = (mode: StrategyMode, lane: StrategyLane, workspace: string, scenario: string): readonly [StrategyMode, StrategyLane, string, number] =>
  workbenchTuple(mode, lane, `${workspace}::${scenario}`);

type StudioRunEnvelope = {
  readonly response: ServiceRunEnvelope;
  readonly score: number;
  readonly matrixRoute: string;
  readonly seedTag: string;
};

const buildRun = async (
  mode: StrategyMode,
  lane: StrategyLane,
  workspace: string,
  scenario: string,
  seedTag: string,
): Promise<StudioRunEnvelope> => {
  const tuple = runTupleForModeLane(mode, lane, workspace, scenario);
  const response = await runIntelligencePlan({
    workspace,
    scenario: `${scenario}:${seedTag}`,
    mode,
    lane,
    tuple,
    seed: {
      source: {
        workspace,
        scenario,
        mode,
        lane,
      },
      seedTag,
      seededAt: new Date().toISOString(),
    },
  });
  const runSummary = matrixSummaryScore(buildSignalMatrix(response.result.events, `${workspace}/${seedTag}`));
  return {
    response,
    score: Math.min(response.result.score + runSummary / 2, 1),
    matrixRoute: `${workspace}:${seedTag}`,
    seedTag,
  };
};

export const useRecoveryLabIntelligenceStudio = () => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const matrix = useMemo(() => {
    const matrix = buildSignalMatrix(state.matrixSources, state.workspace);
    return matrix;
  }, [state.matrixSources, state.workspace]);

  const matrixScore = useMemo(() => matrixSummaryScore(matrix), [matrix]);
  const matrixRows = useMemo(() => matrixTopLanes(matrix, 3), [matrix]);
  const matrixCounts = useMemo(() => summarizeMatrix(matrix), [matrix]);
  const bySeverity = useMemo(() => summarizeWorkbenchSignals(state.matrixSources), [state.matrixSources]);

  const matrixSourceSummary = useMemo(() => {
    const sourceMap: Record<string, number> = {};
    const bySource = matrixRows.reduce((acc, row) => {
      const [source, rawTotal] = row.split(':');
      const total = Number(rawTotal);
      return {
        ...acc,
        [source]: (acc[source] ?? 0) + total,
      };
    }, sourceMap);

    const entries = Object.entries(bySource).map(([source, count]) => ({ source, count }));
    return entries.toSorted((left, right) => right.count - left.count);
  }, [matrixRows]);

  const matrixCells = useMemo(() => Number(matrixCounts.totalSignals ?? 0), [matrixCounts]);

  const signalBars = useMemo(() => resolveScoreBars(state.sessions), [state.sessions]);
  const workspaceKey = `${state.workspace}::${state.scenario}` as const;
  const scenarioSeed = `${state.scenario}::${matrixCells}`;

  const run = useCallback(async (mode: StrategyMode, lane: StrategyLane): Promise<readonly SessionRecord[]> => {
    dispatch({ type: 'setStatus', status: 'running' });

    const [primary, retest] = await Promise.all([
      buildRun(mode, lane, state.workspace, state.scenario, 'primary'),
      buildRun(mode, lane, state.workspace, state.scenario, 'retest'),
    ]);

    const sessions = [
      {
        route: primary.response.request.scenario,
        mode,
        lane,
        score: primary.score,
        tuple: runTupleForModeLane(mode, lane, primary.response.request.workspace, primary.response.request.scenario),
        matrixRoute: primary.matrixRoute,
        seedTag: primary.seedTag,
      },
      {
        route: retest.response.request.scenario,
        mode: retest.response.request.mode,
        lane: retest.response.request.lane,
        score: retest.score,
        tuple: runTupleForModeLane(retest.response.request.mode, retest.response.request.lane, retest.response.request.workspace, retest.response.request.scenario),
        matrixRoute: retest.matrixRoute,
        seedTag: retest.seedTag,
      },
    ];

    const mergedEvents = [...primary.response.result.events, ...retest.response.result.events];

    dispatch({
      type: 'setSessions',
      status: sessions.every((item) => item.score >= 0) ? 'ready' : 'failed',
      sessions,
      matrix: mergedEvents,
    });

    return sessions;
  }, [state.scenario, state.workspace]);

  const runStudio = useCallback(async () => run(state.mode, state.lane), [run, state.lane, state.mode]);

  useEffect(() => {
    if (state.status === 'idle' && state.sessions.length === 0) {
      void run(state.mode, state.lane).catch(() => {
        dispatch({ type: 'setStatus', status: 'failed' });
      });
    }
  }, [run, state.lane, state.mode, state.status, state.sessions.length]);

  const bootstrap = useCallback(() => {
    dispatch({ type: 'setStatus', status: 'running' });
    void run(normalizeMode(state.mode), normalizeLane(state.lane));
  }, [run, state.lane, state.mode]);

  return {
    ...state,
    workspaceKey,
    matrixSources: state.matrixSources,
    matrix,
    matrixScore,
    matrixRows,
    matrixSourceSummary,
    matrixCells,
    signalBars,
    bySeverity,
    scenarioSeed,
    runStudio,
    bootstrap,
    setWorkspace: (workspace: string) => dispatch({ type: 'setWorkspace', workspace }),
    setScenario: (scenario: string) => dispatch({ type: 'setScenario', scenario }),
    setMode: (mode: StrategyMode) => dispatch({ type: 'setMode', mode: normalizeMode(mode) }),
    setLane: (lane: StrategyLane) => dispatch({ type: 'setLane', lane: normalizeLane(lane) }),
    appendSignals: (events: readonly SignalEvent[]) => dispatch({ type: 'appendBootstrapSignals', events }),
    clearStudio: () => dispatch({ type: 'clear' }),
    toTuple: (mode: StrategyMode, lane: StrategyLane) => runTupleForModeLane(mode, lane, state.workspace, state.scenario),
  };
};
