import { useMemo } from 'react';
import { type PlaybookRuntimeMetrics, type ObservabilityScope } from '@domain/recovery-playbook-observability-core';

export interface PolicyFilterSpec {
  readonly scope: ObservabilityScope;
  readonly minScore: number;
  readonly maxDrift: number;
  readonly onlyActiveScopes: boolean;
}

export interface PolicyMatrixCell {
  readonly scope: ObservabilityScope;
  readonly metric: keyof Pick<PlaybookRuntimeMetrics, 'score' | 'drift' | 'variance' | 'confidence'>;
  readonly trend: PlaybookRuntimeMetrics['trend'];
  readonly value: number;
}

export interface PolicyMatrix {
  readonly scope: ObservabilityScope;
  readonly cells: readonly PolicyMatrixCell[];
  readonly total: number;
  readonly active: number;
  readonly averageScore: number;
  readonly averageDrift: number;
}

const defaultFilters = {
  scope: 'playbook',
  minScore: 0,
  maxDrift: 1,
  onlyActiveScopes: true,
} as const satisfies PolicyFilterSpec;

const normalizeToRange = (value: number): number => Math.min(1, Math.max(0, value));

export const usePlaybookPolicyFilters = (input: {
  readonly scope: ObservabilityScope;
  readonly minScore?: number;
  readonly maxDrift?: number;
  readonly metrics: readonly PlaybookRuntimeMetrics[];
}) => {
  const filters = useMemo(
    () =>
      ({
        ...defaultFilters,
        scope: input.scope,
        minScore: normalizeToRange(input.minScore ?? 0),
        maxDrift: normalizeToRange(input.maxDrift ?? 1),
      }) as const,
    [input.scope, input.maxDrift, input.minScore],
  );

  const matrix = useMemo<PolicyMatrix>(() => {
    const scopeEntries = input.metrics.filter((metric) => metric.scope === input.scope);
    const metricNames = ['score', 'drift', 'variance', 'confidence'] as const;

    const cells = scopeEntries.flatMap((metric) =>
      metricNames.map((metricKey) => ({
        scope: input.scope,
        metric: metricKey,
        trend: metric.trend,
        value: metric[metricKey],
      } satisfies PolicyMatrixCell)),
    );

    const scoreValues = scopeEntries.map((metric) => metric.score);
    const driftValues = scopeEntries.map((metric) => metric.drift);

    const active = scopeEntries.filter(
      (metric) => metric.score >= filters.minScore && metric.drift <= filters.maxDrift,
    ).length;

    return {
      scope: filters.scope,
      cells,
      total: scopeEntries.length,
      active,
      averageScore: scoreValues.length === 0 ? 0 : scoreValues.reduce((acc, value) => acc + value, 0) / scoreValues.length,
      averageDrift: driftValues.length === 0 ? 0 : driftValues.reduce((acc, value) => acc + value, 0) / driftValues.length,
    };
  }, [filters.maxDrift, filters.minScore, filters.scope, input.metrics, input.scope]);

  const summary = useMemo(
    () => `${matrix.active}/${matrix.total} metrics active in ${filters.scope}`,
    [filters.scope, matrix.active, matrix.total],
  );

  return { filters, matrix, summary };
};
