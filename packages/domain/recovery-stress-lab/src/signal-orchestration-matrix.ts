import { NoInfer, type FlattenTuple } from '@shared/type-level';
import {
  type RecoverySignal,
  type RecoverySignalId,
  type SeverityBand,
  type TenantId,
  WorkloadTopology,
  WorkloadTopologyEdge,
  WorkloadTopologyNode,
  createSignalId,
  createTenantId,
} from './models';

export type MatrixDimensionKey<T extends string> = `${T}[${number}]`;
export type MatrixCellAddress = `${number}:${number}`;
export type MatrixKey = `${MatrixCellAddress}|${SeverityBand}`;

export type IntensityRange = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface SignalMatrixSignal {
  readonly signalId: RecoverySignalId;
  readonly tenantId: TenantId;
  readonly severity: SeverityBand;
  readonly intensity: IntensityRange;
  readonly route: string;
}

export interface SignalMatrixSnapshot {
  readonly tenantId: TenantId;
  readonly width: number;
  readonly height: number;
  readonly bands: readonly SeverityBand[];
  readonly rows: readonly MatrixRow[];
}

export interface MatrixRow {
  readonly row: number;
  readonly cells: readonly SignalMatrixCell[];
}

export interface SignalMatrixCell {
  readonly key: MatrixKey;
  readonly nodeId: WorkloadTopologyNode['id'];
  readonly edgeId: WorkloadTopologyEdge['from'];
  readonly value: number;
  readonly signals: readonly RecoverySignalId[];
}

export type MatrixCellMap<T extends readonly SignalMatrixCell[]> = {
  [K in T[number]['key']]: Extract<T[number], { key: K }>;
} & {
  [K in MatrixKey]?: SignalMatrixCell;
};

export type RecursiveTuplePath<T> = T extends readonly [infer H, ...infer R]
  ? [H, ...RecursiveTuplePath<R>]
  : [];

export type MatrixToSignalList<T extends readonly SignalMatrixCell[]> = {
  [K in T[number] as K['nodeId']]: Extract<T[number], { nodeId: K['nodeId'] }>['signals'];
};

export type FilterByBand<TMatrix extends readonly SignalMatrixCell[], TBand extends SeverityBand> = {
  [K in keyof TMatrix]: TMatrix[K] extends { key: `${string}:${string}|${TBand}` } ? TMatrix[K] : never;
};

interface MatrixBucket {
  readonly topology: WorkloadTopology;
  readonly signalDigest: string;
  readonly values: readonly SignalMatrixSignal[];
}

const severityWeight: Record<SeverityBand, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const toSignal = (tenantId: TenantId, signal: RecoverySignal, row: number, col: number): SignalMatrixSignal => {
  const signalId = createSignalId(String(signal.id));
  const route = `${tenantId}:signal:${signal.id}`;
  const severity = signal.severity;
  const intensity = severityWeight[severity] as IntensityRange;
  return {
    signalId,
    tenantId,
    severity,
    intensity,
    route: `${route}:${row}:${col}`,
  };
};

const toRowAddress = (row: number): MatrixCellAddress => `${row}:${row}`;

export const computeMatrixKey = (
  row: number,
  column: number,
  band: SeverityBand,
): MatrixKey => {
  return `${row}:${column}|${band}`;
};

export const normalizeSignalTopology = (topology: WorkloadTopology): WorkloadTopology => {
  const nodes = topology.nodes.map((entry) => ({
    id: entry.id,
    name: entry.name,
    ownerTeam: entry.ownerTeam,
    criticality: entry.criticality,
    active: entry.active,
  }));
  const edges = topology.edges.map((entry) => ({
    from: entry.from,
    to: entry.to,
    coupling: Number(Number(entry.coupling).toFixed(3)),
    reason: entry.reason,
  }));
  return {
    tenantId: topology.tenantId,
    nodes,
    edges,
  };
};

export const matrixCellFromSignal = (
  topology: WorkloadTopology,
  signal: RecoverySignal,
  row: number,
  column: number,
): SignalMatrixCell => {
  const edge = topology.edges[column % topology.edges.length] ?? topology.edges[topology.edges.length - 1];
  const value = signal.metadata.intensity ?? 1;
  const normalized = Number(value).toFixed(4);
  return {
    key: computeMatrixKey(row, column, signal.severity),
    nodeId: topology.nodes[row % topology.nodes.length]?.id ?? topology.nodes[0]?.id ?? `node:${row}`,
    edgeId: edge?.from ?? `from:${column}`,
    value: Number(normalized),
    signals: [createSignalId(signal.id)],
  };
};

export const buildSignalMatrix = (
  tenantId: TenantId,
  topology: WorkloadTopology,
  signals: readonly RecoverySignal[],
): SignalMatrixSnapshot => {
  const normalizedTopology = normalizeSignalTopology(topology);
  const rows = normalizedTopology.nodes.map((node, rowIndex) => {
    const cells = signals
      .filter((signal) => signal.id.includes(node.id))
      .map((signal, signalIndex) => matrixCellFromSignal(normalizedTopology, signal, rowIndex, signalIndex));
    return {
      row: rowIndex,
      cells: cells.length > 0 ? cells : [
        {
          key: computeMatrixKey(rowIndex, 0, 'low'),
          nodeId: node.id,
          edgeId: normalizedTopology.edges[rowIndex % Math.max(1, normalizedTopology.edges.length)]?.from ?? `from:${rowIndex}`,
          value: 0,
          signals: [],
        },
      ],
    };
  });

  return {
    tenantId: createTenantId(String(tenantId)),
    width: normalizedTopology.nodes.length,
    height: Math.max(1, normalizedTopology.edges.length),
    bands: ['low', 'medium', 'high', 'critical'],
    rows,
  };
};

export const buildSignalBuckets = (
  tenantId: TenantId,
  topology: WorkloadTopology,
  signals: readonly RecoverySignal[],
): MatrixBucket => {
  const digest = signals
    .map((signal) => `${signal.id}-${signal.severity}-${signal.title}`)
    .sort()
    .join('|');
  const values = signals.map((signal, index) => toSignal(tenantId, signal, index, signals.length))
    .map((signal, index) => ({
      ...signal,
      route: `${signal.route}:${index}`,
    }));
  return {
    topology,
    signalDigest: digest,
    values,
  };
};

export const bucketByNode = <
  const TSignals extends readonly SignalMatrixCell[],
>(
  signals: NoInfer<TSignals>,
): MatrixCellMap<TSignals> => {
  const map: Record<MatrixKey, SignalMatrixCell> = {};
  for (const signal of signals) {
    map[signal.key] = signal;
  }
  return map as MatrixCellMap<TSignals>;
};

export const summarizeRows = (rows: readonly MatrixRow[]): readonly string[] => {
  return rows.map((row) => `${row.row}:${row.cells.length}`);
};

export const asFlatten = <T extends readonly SignalMatrixCell[]>(cells: NoInfer<T>): FlattenTuple<T> => {
  return cells as unknown as FlattenTuple<T>;
};

export const mergeMatrixSnapshots = (
  first: SignalMatrixSnapshot,
  second: SignalMatrixSnapshot,
): SignalMatrixSnapshot => {
  const rows = [...first.rows, ...second.rows].map((row) => {
    const merged = [...row.cells, ...row.cells].map((cell, index) => ({
      ...cell,
      key: computeMatrixKey(index, row.row, 'medium'),
    }));
    return {
      row: row.row,
      cells: merged,
    };
  });

  return {
    tenantId: first.tenantId,
    width: Math.max(first.width, second.width),
    height: Math.max(first.height, second.height),
    bands: [...new Set([...first.bands, ...second.bands])],
    rows,
  };
};

export const matrixFingerprint = (snapshot: SignalMatrixSnapshot): string => {
  const rowHash = snapshot.rows.map((row) => `${row.row}=${row.cells.length}`).join(';');
  return `${snapshot.tenantId}:${snapshot.width}:${snapshot.height}:${rowHash}`;
};
