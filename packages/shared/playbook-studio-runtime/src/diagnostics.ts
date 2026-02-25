import type { ArtifactId, RunId } from './ids';
import type { JsonValue } from '@shared/type-level';

export type Severity = 'critical' | 'warning' | 'info';
export type DiagnosticCode<T extends string = string> = `${Uppercase<T>}:${number}`;

export interface StudioDiagnostic {
  readonly code: DiagnosticCode;
  readonly title: string;
  readonly message: string;
  readonly runId: RunId;
  readonly artifactId: ArtifactId;
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly metadata: {
    readonly severity: Severity;
    readonly at: number;
  };
}

export type DiagnosticBucket = {
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
};

type MutableDiagnosticBucket = {
  critical: number;
  warning: number;
  info: number;
};

export type DiagnosticBuckets = Record<string, DiagnosticBucket>;

export type FlattenTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...FlattenTuple<Tail & readonly unknown[]>]
  : readonly [];

export const buildDiagnostics = <
  const TArtifacts extends readonly ArtifactId[],
>(
  artifacts: TArtifacts,
  diagnostics: readonly StudioDiagnostic[],
): DiagnosticBuckets => {
  const bucket: DiagnosticBuckets = {};

  for (const diagnostic of diagnostics) {
    const entry: MutableDiagnosticBucket = bucket[diagnostic.code] ?? {
      critical: 0,
      warning: 0,
      info: 0,
    };
    entry[diagnostic.metadata.severity] += 1;
    bucket[diagnostic.code] = entry;
  }

  const expanded: DiagnosticBuckets = {};
  for (const artifact of artifacts) {
    for (const [code, value] of Object.entries(bucket)) {
      expanded[`${artifact}:${code}`] = value;
    }
  }

  return expanded;
};

export const summarizeDiagnostics = <T extends readonly StudioDiagnostic[]>(
  diagnostics: T,
): {
  readonly total: number;
  readonly bySeverity: Record<Severity, number>;
  readonly byCode: Record<string, number>;
  readonly codes: readonly DiagnosticCode[];
} => {
  const bySeverity = { critical: 0, warning: 0, info: 0 };
  const byCode: Record<string, number> = {};

  for (const diagnostic of diagnostics) {
    bySeverity[diagnostic.metadata.severity] += 1;
    byCode[diagnostic.code] = (byCode[diagnostic.code] ?? 0) + 1;
  }

  return {
    total: diagnostics.length,
    bySeverity,
    byCode,
    codes: Object.keys(byCode) as DiagnosticCode[],
  };
};

export const renderDiagnostic = (diagnostic: StudioDiagnostic): string =>
  `[${diagnostic.metadata.severity}] ${diagnostic.code} ${diagnostic.title}: ${diagnostic.message}`;

export const flattenDiagnostics = <T extends readonly StudioDiagnostic[]>(
  groups: readonly T[],
): readonly T[] =>
  groups.flat() as readonly T[];

export const flattenWithPaths = <T extends readonly unknown[]>(groups: readonly T[]): readonly T[] => {
  return groups.flat() as readonly T[];
};

export const normalizeSeverity = (value: string): Severity => {
  if (value === 'critical' || value === 'warning') return value;
  return 'info';
};
