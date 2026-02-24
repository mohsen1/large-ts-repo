import { type RecoverySignal, type StageSignal, type SeverityBand, type StageSignalId, type WorkloadTopology } from './models';
import { parseRecoverySignals, rankRecoverySignals, bucketBySeverity } from './signal-orchestration';
import { type NoInfer } from '@shared/type-level';

export type MatrixAxis = 'criticality' | 'coverage' | 'time';
export type MatrixBucket = `${string}:${SeverityBand}`;

export interface MatrixCell {
  readonly x: MatrixAxis;
  readonly y: SeverityBand;
  readonly count: number;
  readonly signalIds: readonly StageSignalId[];
}

export type MatrixRow = Record<string, MatrixCell>;

type SignalSignature = `${string}:${SeverityBand}`;

type ReadonlySignals<TSignals extends readonly StageSignal[]> = ReadonlyArray<{
  readonly id: StageSignalId;
  readonly severity: SeverityBand;
}>;

export interface SignalMatrix<TSignals extends readonly StageSignal[]> {
  readonly tenant: string;
  readonly rows: readonly MatrixRow[];
  readonly signatures: readonly SignalSignature[];
  readonly signals: ReadonlySignals<TSignals>;
}

const matrixSeed = {
  windowSize: 8,
  decay: 0.95,
};

export const buildSignalMatrix = <TSignals extends readonly StageSignal[]>(
  tenantId: string,
  signals: NoInfer<TSignals>,
): SignalMatrix<TSignals> => {
  const ranked = rankRecoverySignals(tenantId as never, signals);
  const buckets = bucketBySeverity(signals);
  const critical = buckets.critical.length;
  const high = buckets.high.length;
  const medium = buckets.medium.length;
  const low = buckets.low.length;
  const total = Math.max(critical + high + medium + low, 1);

  const rows: MatrixRow[] = [
    {
      criticality: {
        x: 'criticality',
        y: 'critical',
        count: critical,
        signalIds: buckets.critical.map((entry) => entry.signal),
      },
      coverage: {
        x: 'coverage',
        y: 'critical',
        count: high,
        signalIds: buckets.high.map((entry) => entry.signal),
      },
      time: {
        x: 'time',
        y: 'critical',
        count: medium,
        signalIds: buckets.medium.map((entry) => entry.signal),
      },
    },
    {
      criticality: {
        x: 'criticality',
        y: 'low',
        count: low,
        signalIds: buckets.low.map((entry) => entry.signal),
      },
      coverage: {
        x: 'coverage',
        y: 'low',
        count: low,
        signalIds: buckets.low.map((entry) => entry.signal),
      },
      time: {
        x: 'time',
        y: 'low',
        count: total - low,
        signalIds: [...buckets.critical, ...buckets.high].map((entry) => entry.signal),
      },
    },
  ];

  const signatures = ranked
    .map((entry) => `${entry.className}:${entry.severity}` as const)
    .toSorted();

  return {
    tenant: tenantId,
    rows,
    signatures,
    signals: signals.map((signal) => ({
      id: signal.signal,
      severity: signal.severity,
    })),
  };
};

export interface DigestableTopology {
  readonly nodes: number;
  readonly edges: number;
}

export const summarizeMatrix = (matrix: SignalMatrix<readonly StageSignal[]>): {
  readonly totalSignals: number;
  readonly concentration: number;
  readonly topSignal: SignalSignature;
} => {
  const topSignal = matrix.signatures.at(-1) ?? `critical:critical`;
  const totalSignals = matrix.rows.reduce((acc, row) => acc + Object.values(row).reduce((sum, cell) => sum + cell.count, 0), 0);
  const concentration = Number((Math.max(matrix.rows.length, 1) * matrixSeed.decay).toFixed(4));
  return {
    totalSignals,
    concentration,
    topSignal,
  };
};

export const mergeSignals = <TLeft extends readonly RecoverySignal[], TRight extends readonly RecoverySignal[]>(
  left: TLeft,
  right: TRight,
): readonly RecoverySignal[] => {
  const rightSet = new Set(right.map((signal) => signal.id));
  return [...left.filter((signal) => !rightSet.has(signal.id)), ...right];
};

export interface MatrixForecast<TTopology extends DigestableTopology> {
  readonly window: number;
  readonly signature: string;
  readonly topology: TTopology;
}

export const forecastMatrixTopology = <TTopology extends DigestableTopology>(topology: TTopology): MatrixForecast<TTopology> => {
  const window = topology.nodes * matrixSeed.windowSize;
  const signature = `${topology.nodes}-${topology.edges}-${window}`;
  return {
    window,
    signature,
    topology,
  };
};
