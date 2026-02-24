import { readFileSync } from 'node:fs';
import { RecoverySignal, SeverityBand, SignalClass, CommandRunbook, RecoverySignalId, WorkloadTopology, createSignalId } from './models';
import { normalizeTopology } from './topology-intelligence';

export interface SignalDensityCell {
  readonly signalId: RecoverySignalId;
  readonly class: SignalClass;
  readonly band: SeverityBand;
  readonly density: number;
  readonly ageMinutes: number;
}

export interface SignalMatrixState {
  readonly tenantId: string;
  readonly matrixId: string;
  readonly updatedAt: string;
  readonly cells: readonly SignalDensityCell[];
}

export interface SignalCoverage {
  readonly tenantId: string;
  readonly byClass: Readonly<Record<SignalClass, number>>;
  readonly byBand: Readonly<Record<SeverityBand, number>>;
  readonly criticalRunbookMatches: readonly CommandRunbook['id'][];
  readonly topologyDensity: number;
}

const signalBandWeight = (band: SeverityBand): number => {
  switch (band) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
};

const estimateSignalAge = (signal: RecoverySignal, index: number): number => {
  const createdAt = Date.parse(signal.createdAt);
  const now = Date.now();
  const skew = index * 13;
  return Math.max(0, Math.floor((now - createdAt) / (1000 * 60)) + skew);
};

const defaultCoverage = (): SignalCoverage => ({
  tenantId: 'unknown',
  byClass: {
    availability: 0,
    integrity: 0,
    performance: 0,
    compliance: 0,
  },
  byBand: {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  },
  criticalRunbookMatches: [],
  topologyDensity: 0,
});

const normalizeLabel = (value: string): string => value.trim().toLowerCase();

const isCriticalMatch = (signal: RecoverySignal, runbook: CommandRunbook): boolean => {
  if (signal.severity === 'critical') {
    return true;
  }
  if (signal.class === 'integrity' && signal.metadata?.['priority'] === 'high') {
    return true;
  }
  return runbook.steps.some((step) => step.requiredSignals.includes(signal.id));
};

const classForId = (signal: RecoverySignal, index: number): SignalClass => {
  const key = normalizeLabel(signal.class);
  const fallback = index % 2 === 0 ? 'availability' : 'performance';
  const mapped = key === 'integrity' || key === 'compliance' || key === 'availability' || key === 'performance'
    ? key
    : fallback;
  return mapped;
};

export const buildSignalDensityMatrix = (
  tenantId: string,
  signals: readonly RecoverySignal[],
): SignalMatrixState => {
  const cells: SignalDensityCell[] = signals.map((signal, index) => ({
    signalId: signal.id,
    class: classForId(signal, index),
    band: signal.severity,
    density: signalBandWeight(signal.severity) * Math.max(1, signal.metadata?.['weight'] ? Number(signal.metadata['weight']) : 1),
    ageMinutes: estimateSignalAge(signal, index),
  }));

  return {
    tenantId,
    matrixId: `signal-matrix-${tenantId}-${cells.length}`,
    updatedAt: new Date().toISOString(),
    cells,
  };
};

export const computeSignalCoverage = (
  tenantId: string,
  topology: WorkloadTopology,
  signals: readonly RecoverySignal[],
  runbooks: readonly CommandRunbook[],
): SignalCoverage => {
  const normalized = normalizeTopology(topology);
  const base = defaultCoverage();
  const byClass: Record<SignalClass, number> = {
    availability: 0,
    integrity: 0,
    performance: 0,
    compliance: 0,
  };
  const byBand: Record<SeverityBand, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const criticalRunbookMatches: CommandRunbook['id'][] = [];
  const uniqueRunbooks = new Set<CommandRunbook['id']>();
  const classWeight = 1;

  for (const signal of signals) {
    byClass[signal.class] += 1;
    byBand[signal.severity] += signalBandWeight(signal.severity);
    for (const runbook of runbooks) {
      if (isCriticalMatch(signal, runbook)) {
        uniqueRunbooks.add(runbook.id);
      }
    }
  }

  const topologyDensity = normalized.nodes.length > 0 ? byBand.critical / normalized.nodes.length : 0;
  for (const id of uniqueRunbooks) {
    criticalRunbookMatches.push(id);
  }

  return {
    tenantId,
    byClass: {
      ...base.byClass,
      ...byClass,
    },
    byBand: {
      ...base.byBand,
      ...byBand,
    },
    criticalRunbookMatches,
    topologyDensity: Number((topologyDensity * classWeight).toFixed(4)),
  };
};

export const mergeSignalMatrices = (...matrices: readonly SignalMatrixState[]): SignalMatrixState => {
  if (matrices.length === 0) {
    return {
      tenantId: 'noop',
      matrixId: 'noop-matrix',
      updatedAt: new Date().toISOString(),
      cells: [],
    };
  }

  const bySignal = new Map<string, SignalDensityCell>();
  const tenantId = matrices[0]?.tenantId ?? 'noop';

  for (const matrix of matrices) {
    for (const cell of matrix.cells) {
      const previous = bySignal.get(cell.signalId);
      if (!previous || previous.density < cell.density) {
        bySignal.set(cell.signalId, cell);
      }
    }
  }

  return {
    tenantId,
    matrixId: `merged-${tenantId}-${bySignal.size}`,
    updatedAt: new Date().toISOString(),
    cells: [...bySignal.values()],
  };
};

export const pickTopSignalIds = (matrix: SignalMatrixState, limit: number): readonly RecoverySignalId[] => {
  return matrix.cells
    .slice()
    .sort((left, right) => right.density - left.density)
    .slice(0, limit)
    .map((cell) => cell.signalId);
};

export const exportMatrixCsv = (matrix: SignalMatrixState): string => {
  const header = ['signalId', 'class', 'band', 'density', 'ageMinutes'];
  const body = matrix.cells.map((cell) =>
    [cell.signalId, cell.class, cell.band, cell.density.toFixed(4), cell.ageMinutes.toString()].join(','),
  );
  return [header.join(','), ...body].join('\n');
};

export const readMatrixFromFile = (path: string): SignalMatrixState => {
  const raw = readFileSync(path, 'utf8').trim();
  const lines = raw.split('\n');
  if (lines.length <= 1) {
    return {
      tenantId: 'filesystem',
      matrixId: `file-${path}`,
      updatedAt: new Date().toISOString(),
      cells: [],
    };
  }

  const cells = lines.slice(1).map((line, index) => {
    const [signalId, cls, band, density, ageMinutes] = line.split(',');
    return {
      signalId: createSignalId(signalId),
      class: cls as SignalClass,
      band: band as SeverityBand,
      density: Number(density),
      ageMinutes: Number(ageMinutes) + index,
    } satisfies SignalDensityCell;
  });
  return {
    tenantId: 'filesystem',
    matrixId: `file-${path}`,
    updatedAt: new Date().toISOString(),
    cells,
  };
};
