import {
  type ConvergenceScope,
  type ConvergenceStage,
  type ConvergenceRunId,
  type ConvergenceOutput,
  type ConvergenceConstraint,
} from '@domain/recovery-lab-orchestration-core';
import { collectIterable, mapIterable } from '@shared/stress-lab-runtime';
import type { ConvergenceStore, ConvergenceStoreRecord } from './convergence-store';

type GroupMap<T extends string> = {
  [K in T]: {
    key: K;
    count: number;
    totalWeight: number;
  };
};

const createScopeSummary = (): GroupMap<ConvergenceScope> => ({
  tenant: { key: 'tenant', count: 0, totalWeight: 0 },
  topology: { key: 'topology', count: 0, totalWeight: 0 },
  signal: { key: 'signal', count: 0, totalWeight: 0 },
  policy: { key: 'policy', count: 0, totalWeight: 0 },
  fleet: { key: 'fleet', count: 0, totalWeight: 0 },
});

const createStageSummary = (): GroupMap<ConvergenceStage> => ({
  input: { key: 'input', count: 0, totalWeight: 0 },
  resolve: { key: 'resolve', count: 0, totalWeight: 0 },
  simulate: { key: 'simulate', count: 0, totalWeight: 0 },
  recommend: { key: 'recommend', count: 0, totalWeight: 0 },
  report: { key: 'report', count: 0, totalWeight: 0 },
});

export interface StoreQueryResult {
  readonly tenantCount: number;
  readonly stageCount: number;
  readonly scopeCount: number;
  readonly byStage: readonly {
    readonly key: ConvergenceStage;
    readonly count: number;
    readonly totalWeight: number;
  }[];
  readonly byScope: readonly {
    readonly key: ConvergenceScope;
    readonly count: number;
    readonly totalWeight: number;
  }[];
  readonly latestRun: ConvergenceStoreRecord | null;
}

export const summarizeStore = (records: readonly ConvergenceStoreRecord[]): StoreQueryResult => {
  const byStage: Record<ConvergenceStage, number> = {
    input: 0,
    resolve: 0,
    simulate: 0,
    recommend: 0,
    report: 0,
  };
  const byScope: Record<ConvergenceScope, number> = {
    tenant: 0,
    topology: 0,
    signal: 0,
    policy: 0,
    fleet: 0,
  };
  const scopeSummaries = groupByScope(records);
  const scopeCount = Object.values(scopeSummaries).reduce((acc, entry) => acc + (entry.count > 0 ? 1 : 0), 0);

  for (const record of records) {
    byStage[record.stage] += 1;
    byScope[record.scope] += 1;
  }

  const latest =
    records
      .toSorted((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null;

  return {
    tenantCount: new Set(records.map((record) => record.tenantId)).size,
    stageCount: records.length,
    scopeCount,
    byStage: collectIterable(
      mapIterable(Object.entries(byStage) as [ConvergenceStage, number][], ([stage, count]) => ({
        key: stage,
        count,
        totalWeight: count,
      })),
    ),
    byScope: collectIterable(
      mapIterable(Object.entries(byScope) as [ConvergenceScope, number][], ([scope, count]) => ({
        key: scope,
        count,
        totalWeight: count,
      })),
    ),
    latestRun: latest,
  };
};

export const flattenConstraints = (record: ConvergenceStoreRecord): readonly ConvergenceConstraint[] =>
  [...record.constraints].toSorted((left, right) => left.key.localeCompare(right.key));

export const groupByScope = (records: readonly ConvergenceStoreRecord[]): GroupMap<ConvergenceScope> => {
  const output = createScopeSummary();

  for (const record of records) {
    switch (record.scope) {
      case 'tenant':
        output.tenant = { ...output.tenant, count: output.tenant.count + 1, totalWeight: output.tenant.totalWeight + record.output.score };
        break;
      case 'topology':
        output.topology = { ...output.topology, count: output.topology.count + 1, totalWeight: output.topology.totalWeight + record.output.score };
        break;
      case 'signal':
        output.signal = { ...output.signal, count: output.signal.count + 1, totalWeight: output.signal.totalWeight + record.output.score };
        break;
      case 'policy':
        output.policy = { ...output.policy, count: output.policy.count + 1, totalWeight: output.policy.totalWeight + record.output.score };
        break;
      case 'fleet':
        output.fleet = { ...output.fleet, count: output.fleet.count + 1, totalWeight: output.fleet.totalWeight + record.output.score };
        break;
      default:
        break;
    }
  }

  return output;
};

export const groupByStage = (records: readonly ConvergenceStoreRecord[]): GroupMap<ConvergenceStage> => {
  const output = createStageSummary();

  for (const record of records) {
    switch (record.stage) {
      case 'input':
        output.input = { ...output.input, count: output.input.count + 1, totalWeight: output.input.totalWeight + record.output.score };
        break;
      case 'resolve':
        output.resolve = { ...output.resolve, count: output.resolve.count + 1, totalWeight: output.resolve.totalWeight + record.output.score };
        break;
      case 'simulate':
        output.simulate = { ...output.simulate, count: output.simulate.count + 1, totalWeight: output.simulate.totalWeight + record.output.score };
        break;
      case 'recommend':
        output.recommend = { ...output.recommend, count: output.recommend.count + 1, totalWeight: output.recommend.totalWeight + record.output.score };
        break;
      case 'report':
        output.report = { ...output.report, count: output.report.count + 1, totalWeight: output.report.totalWeight + record.output.score };
        break;
      default:
        break;
    }
  }

  return output;
};

export const diffConstraintWeights = (
  left: readonly ConvergenceConstraint[],
  right: readonly ConvergenceConstraint[],
): readonly { key: string; delta: number }[] => {
  const leftMap = new Map(left.map((entry) => [entry.key, entry.weight] as const));
  const rightMap = new Map(right.map((entry) => [entry.key, entry.weight] as const));
  const keys = new Set([...leftMap.keys(), ...rightMap.keys()]);

  return collectIterable(
    mapIterable(keys, (key) => ({
      key,
      delta: Number(((rightMap.get(key) ?? 0) - (leftMap.get(key) ?? 0)).toFixed(6)),
    })),
  ).toSorted((leftValue, rightValue) => Math.abs(rightValue.delta) - Math.abs(leftValue.delta));
};

export const topConstraintShifts = (
  records: readonly ConvergenceStoreRecord[],
  limit = 5,
): readonly { runId: ConvergenceRunId; stage: ConvergenceStage; score: number }[] =>
  records
    .map((record) => ({
      runId: record.runId,
      stage: record.stage,
      score: record.output.confidence * record.output.score,
    }))
    .toSorted((left, right) => right.score - left.score)
    .slice(0, limit);

export const runStageTimeline = async (
  store: ConvergenceStore,
  tenantId: string,
  stage: ConvergenceStage,
): Promise<readonly { runId: ConvergenceRunId; output: ConvergenceOutput; diagnostics: readonly string[] }[]> => {
  const records = await store.byStage('tenant', stage);

  return records
    .filter((record) => record.tenantId === tenantId)
    .map((record) => ({
      runId: record.runId,
      output: record.output,
      diagnostics: [...record.diagnostics],
    }));
};

export const collectOutputSignals = (
  records: readonly ConvergenceStoreRecord[],
): readonly { runId: ConvergenceRunId; signals: readonly string[] }[] =>
  collectIterable(
    mapIterable(records, (record) => ({
      runId: record.runId,
      signals: record.diagnostics.map((entry) => `signal:${entry}`),
    })),
  );

export const constraintDensityIndex = (
  records: readonly ConvergenceStoreRecord[],
): readonly { scope: ConvergenceScope; total: number }[] =>
  Object.entries(groupByScope(records)).map(([scope, entry]) => ({
    scope: scope as ConvergenceScope,
    total: entry.count,
  }));
