import { buildConvergenceLatticeManifest, buildConvergenceLatticeManifest as compileManifest } from '@domain/recovery-lab-orchestration-core';
import type { RuntimeOutput } from './convergence-runtime';
import { collectIterable, mapIterable } from '@shared/stress-lab-runtime';
import type { ConvergenceConstraint, ConvergenceOutput, ConvergenceRunId } from '@domain/recovery-lab-orchestration-core';
import { createTenantId } from '@domain/recovery-stress-lab';

export type InsightKind = 'score' | 'confidence' | 'risk' | 'trace' | 'scope';

export type InsightSeverity = 'low' | 'medium' | 'high';

export interface InsightSignal {
  readonly kind: InsightKind;
  readonly severity: InsightSeverity;
  readonly value: string;
}

export interface InsightsReport {
  readonly tenantId: string;
  readonly runId: ConvergenceRunId;
  readonly signalCount: number;
  readonly activeConstraintCount: number;
  readonly constraintsByScope: Record<string, number>;
  readonly timeline: readonly string[];
  readonly flags: readonly InsightSignal[];
}

const toSeverity = (value: number): InsightSeverity => {
  if (value >= 0.8) return 'low';
  if (value >= 0.5) return 'medium';
  return 'high';
};

const scopedSignalCount = (constraints: readonly ConvergenceConstraint[]): Record<string, number> => {
  const output: Record<string, number> = {
    tenant: 0,
    topology: 0,
    signal: 0,
    policy: 0,
    fleet: 0,
  };
  for (const constraint of constraints) {
    output[constraint.scope] += 1;
  }
  return output;
};

const makeSignal = (kind: InsightKind, value: number, stage: string): InsightSignal => {
  const severity = toSeverity(Math.max(0, Math.min(1, value)));
  return {
    kind,
    severity,
    value: `${kind}:${stage}:${severity}:${value.toFixed(3)}`,
  };
};

const outputSignals = (output: ConvergenceOutput): readonly InsightSignal[] =>
  [
    makeSignal('score', output.score, output.stage),
    makeSignal('confidence', output.confidence, output.stage),
    makeSignal('risk', 1 - output.confidence, output.stage),
    makeSignal('trace', output.diagnostics.length, output.stage),
    {
      kind: 'scope',
      severity: output.signalDigest.report > output.signalDigest.input ? 'low' : 'medium',
      value: `scope:${output.stage}`,
    },
  ];

export const buildInsights = (
  tenantId: string,
  run: RuntimeOutput,
  constraints: readonly ConvergenceConstraint[],
): InsightsReport => ({
  tenantId,
  runId: run.runId,
  signalCount: run.output.selectedRunbooks.length + run.output.diagnostics.length,
  activeConstraintCount: constraints.filter((constraint) => constraint.active).length,
  constraintsByScope: scopedSignalCount(constraints),
  timeline: run.timeline,
  flags: outputSignals(run.output),
});

export const aggregateInsights = (runs: readonly RuntimeOutput[]): {
  readonly top: readonly InsightsReport[];
  readonly riskSignals: readonly string[];
} => {
  const withInputs = runs.map((run) => buildInsights('tenant', run, run.constraints));
  const sorted = [...withInputs].toSorted((left, right) => right.flags.length - left.flags.length);
  const riskSignals = collectIterable(
    mapIterable(sorted, (report) =>
      report.flags
        .filter((signal) => signal.severity === 'high')
        .map((signal) => signal.value)
        .join(','),
    ),
  );

  return {
    top: sorted,
    riskSignals,
  };
};

export const buildConvergenceInsightCatalog = (
  tenantId: string,
  scope: string,
): readonly string[] => {
  const manifests = compileManifest(createTenantId(tenantId), [scope as never], ['input', 'resolve', 'simulate', 'recommend', 'report']);
  return manifests.flatMap((manifest) => [
    `${manifest.scope}:${manifest.nodeCount}:${manifest.edgeCount}:${manifest.labels.join(':')}`,
  ]);
};

export const traceManifestCount = async (tenantId: string, tenantScopes: readonly string[]): Promise<number> => {
  const manifests = tenantScopes.flatMap((scope) => buildConvergenceInsightCatalog(tenantId, scope));
  return manifests.length;
};
