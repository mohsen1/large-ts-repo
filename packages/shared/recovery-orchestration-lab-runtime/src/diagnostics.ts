import { parseRuntimeId } from './ids.js';
import type { RuntimeTopology } from './topology.js';

export interface DiagnosticRecord {
  readonly timestamp: string;
  readonly dimension: string;
  readonly value: number;
}

export interface RuntimeDiagnostics {
  readonly runId: string;
  readonly topologySig: string;
  readonly records: readonly DiagnosticRecord[];
  readonly toJson: () => string;
}

export const createDiagnostics = (runIdRaw: string, topology: RuntimeTopology): RuntimeDiagnostics => {
  const runId = parseRuntimeId('run', runIdRaw);
  const records: DiagnosticRecord[] = [];
  let sample = 1;

  for (const node of topology.nodes) {
    records.push({
      timestamp: new Date().toISOString(),
      dimension: `node:${node.id}:weight`,
      value: node.weight * sample++,
    });
  }

  return {
    runId: runId as unknown as string,
    topologySig: topology.nodes.map((node) => node.id).join(','),
    records: records,
    toJson: () => JSON.stringify({ runId, records }, null, 2),
  };
};

export const mergeDiagnostics = <T extends RuntimeDiagnostics>(...diagnostics: readonly T[]): ReadonlyArray<DiagnosticRecord> => {
  return diagnostics.flatMap((entry) => entry.records);
};

export const summarizeDiagnostics = (records: readonly DiagnosticRecord[]): { min: number; max: number; average: number } => {
  if (records.length === 0) {
    return { min: 0, max: 0, average: 0 };
  }
  const values = records.map((entry) => entry.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = values.reduce((acc, value) => acc + value, 0) / values.length;
  return { min, max, average };
};

export const diagnosticSignal = (record: DiagnosticRecord): string =>
  `${record.dimension}=${record.value.toFixed(2)}@${record.timestamp}`;
