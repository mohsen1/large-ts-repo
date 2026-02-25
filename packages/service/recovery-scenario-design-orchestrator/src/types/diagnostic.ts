import { Brand } from '@shared/type-level';
import type { StageStatus } from '@domain/recovery-scenario-design';

export type DesignDiagnosticsLevel = 'none' | 'minimal' | 'full';
export type DiagnosticsBrand = Brand<string, 'DesignDiagnosticMode'>;

export type DiagnosticConfig<TMode extends DesignDiagnosticsLevel = 'minimal'> = {
  readonly mode: TMode;
  readonly captureSamples: boolean;
  readonly emitSnapshots: TMode extends 'full' ? true : boolean;
};

export interface DesignDiagnosticRecord {
  readonly id: Brand<string, 'DesignDiagnosticRecord'>;
  readonly label: string;
  readonly level: DiagnosticsBrand;
  readonly status: 'ok' | 'warn' | 'error';
}

export interface DesignDiagnosticResult {
  readonly runId: Brand<string, 'ScenarioRunId'>;
  readonly records: readonly DesignDiagnosticRecord[];
  readonly sampled: number;
}

export interface DiagnosticPayload<T> {
  readonly kind: StageStatus;
  readonly value: T;
}

type ConfigMatrix<T> = {
  readonly [K in keyof T]: T[K] extends object ? ConfigMatrix<T[K]> : Brand<K & string, 'DiagConfigKey'>;
};

export type MappedDiagnosticPayload<T extends Record<string, unknown>> = {
  [K in keyof T as `diag.${string & K}`]: T[K];
};

export type Expand<T extends object, K extends keyof T = keyof T> = {
  readonly [P in K]: T[P] extends infer Value
    ? Value extends object
      ? Expand<Value & Record<string, unknown>>
      : Value
    : never;
};

export function normalizeDiagnosticsMode<T extends DesignDiagnosticsMode>(mode: T): T {
  if (mode === 'full' || mode === 'minimal' || mode === 'none') {
    return mode;
  }
  return 'minimal';
}

export function buildDiagnosticRecords(values: readonly string[]): readonly DesignDiagnosticRecord[] {
  return values.map((value, index) => ({
    id: `diag-${index}` as DesignDiagnosticRecord['id'],
    label: value,
    level: 'diagnostic-mode' as DiagnosticsBrand,
    status: index % 2 === 0 ? 'ok' : 'warn',
  }));
}

export function aggregateDiagnosticResult(records: readonly DesignDiagnosticRecord[]): DesignDiagnosticResult {
  const sampled = records.reduce((acc, record) => acc + record.label.length + record.id.length, 0);
  return {
    runId: `run-${Date.now()}` as Brand<string, 'ScenarioRunId'>,
    records,
    sampled,
  };
}

export type StageMatrix<T, K extends keyof T = keyof T> = {
  readonly [P in K]: ConfigMatrix<T[P] & object>;
};

export const diagnosticConfigDefaults = {
  mode: 'full' as const,
  captureSamples: true,
};
