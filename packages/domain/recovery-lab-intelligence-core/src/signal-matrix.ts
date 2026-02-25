import type { StrategyMode, SignalEvent, StrategyTuple, StrategyPlan } from './types';
import { laneFromSeverity, type LatticeLane, buildSummaryFromNodes, toNode } from './advanced-types';

export interface Cell {
  readonly id: string;
  readonly source: string;
  readonly mode: StrategyMode;
  readonly severity: SignalEvent['severity'];
  readonly lane: LatticeLane;
  readonly count: number;
}

export interface SignalMatrix {
  readonly laneTotals: Readonly<Record<LatticeLane, number>>;
  readonly cells: readonly Cell[];
  readonly tuple: StrategyTuple;
  readonly route: string;
}

const emptyRows = {
  forecast: 0,
  resilience: 0,
  containment: 0,
  recovery: 0,
  assurance: 0,
} as const;

export const matrixLaneOrder = ['forecast', 'resilience', 'containment', 'recovery', 'assurance'] as const;

const tupleSeed = ['simulate', 'forecast', 'seed', 1] as const satisfies StrategyTuple;

const eventToMode = (event: SignalEvent): StrategyMode => {
  return event.severity === 'warn' ? 'analyze' : event.severity === 'error' ? 'stress' : event.severity === 'critical' || event.severity === 'fatal' ? 'simulate' : 'simulate';
};

export const buildSignalMatrix = <TEvents extends readonly SignalEvent[]>(events: TEvents, tenantId: string): SignalMatrix => {
  const route = `signal-matrix/${tenantId}`;
  const cells = events.map((event, index) => {
    const lane = laneFromSeverity(event.severity);
    return {
      id: `${tenantId}:${event.source}:${index}`,
      source: event.source,
      mode: eventToMode(event),
      severity: event.severity,
      lane,
      count: 1,
    } satisfies Cell;
  });

  const laneTotals = cells.reduce<Record<LatticeLane, number>>(
    (acc, cell) => ({
      ...acc,
      [cell.lane]: (acc[cell.lane] ?? 0) + cell.count,
    }),
    { ...emptyRows },
  );

  return {
    laneTotals,
    cells,
    tuple: [...tupleSeed],
    route,
  };
};

export const matrixRows = (matrix: SignalMatrix): readonly { readonly lane: LatticeLane; readonly total: number }[] => {
  return matrixLaneOrder.map((lane) => ({ lane, total: matrix.laneTotals[lane] }));
};

export const summarizeMatrix = (matrix: SignalMatrix): StrategyPlan['metadata'] => {
  const rows = matrixRows(matrix);
  const hottest = rows.toSorted((left, right) => right.total - left.total)[0];
  return {
    __schema: 'recovery-lab-intelligence-core::runtime',
    route: matrix.route,
    totalSignals: matrix.cells.length,
    mode: matrix.tuple[0],
    lane: matrix.tuple[1],
    topLane: hottest?.lane ?? 'forecast',
    tuple: matrix.tuple,
  } as StrategyPlan['metadata'];
};

export const matrixCells = (matrix: SignalMatrix): readonly Cell[] => matrix.cells;

export interface MatrixAwareResult<TPayload> {
  readonly output: TPayload;
  readonly events: readonly SignalEvent[];
  readonly warnings: readonly SignalEvent[];
  readonly score: number;
}

export const attachMatrixToResult = <TPayload>(result: {
  readonly output: TPayload;
  readonly events: readonly SignalEvent[];
  readonly warnings?: readonly SignalEvent[];
}, matrix: SignalMatrix): MatrixAwareResult<TPayload> => {
  const summary = buildSummaryFromNodes(
    result.events.map((event) =>
      toNode(
        eventToMode(event),
        laneFromSeverity(event.severity),
        'capture',
        event,
      ),
    ),
  );

  return {
    ...result,
    output: result.output,
    score: Math.min(1, summary.score),
    warnings: [
      {
        source: 'manual',
        severity: 'warn',
        at: new Date().toISOString(),
        detail: {
          matrixRoute: matrix.route,
          rows: matrixRows(matrix),
          score: summary.score,
        },
      },
      ...((result.warnings ?? []) as readonly SignalEvent[]),
    ],
    events: result.events,
  };
};

export const matrixSummaryRows = (
  rows: ReturnType<typeof matrixRows>,
): Readonly<Record<LatticeLane, number>> =>
  rows.reduce<Record<LatticeLane, number>>(
    (acc, row) => ({
      ...acc,
      [row.lane]: acc[row.lane] + row.total,
    }),
    {
      forecast: 0,
      resilience: 0,
      containment: 0,
      recovery: 0,
      assurance: 0,
    },
  );

export const matrixSummaryScore = (matrix: SignalMatrix): number => {
  const rows = matrixRows(matrix);
  const totals = rows.reduce((sum, row) => sum + row.total, 0);
  const weighted = rows.reduce((sum, row) => sum + row.total * (row.lane === 'assurance' ? 5 : row.lane === 'containment' ? 2 : 1), 0);
  return totals > 0 ? Math.min(1, weighted / (totals * 5)) : 0;
};

export const matrixTopLanes = (matrix: SignalMatrix, limit = 2): readonly string[] =>
  matrixRows(matrix)
    .toSorted((left, right) => right.total - left.total)
    .slice(0, limit)
    .map((entry) => `${entry.lane}:${entry.total}`);

export const matrixHasSeverity = (
  matrix: SignalMatrix,
  severity: SignalEvent['severity'],
): boolean => matrix.cells.some((cell) => cell.severity === severity);

export const matrixDigestTimeline = (
  matrix: SignalMatrix,
): readonly { readonly at: string; readonly lane: string; readonly count: number }[] =>
  matrixRows(matrix).map((entry, index) => ({
    at: new Date(Date.now() + index * 17).toISOString(),
    lane: entry.lane,
    count: entry.total,
  }));

export const renderSignalDigest = (matrix: SignalMatrix): string =>
  matrix.cells
    .map((cell) => `${cell.source}:${cell.mode}:${cell.count}`)
    .join('|');
