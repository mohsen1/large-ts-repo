import {
  createConstraintId,
  createConvergenceRunId,
  createEnvelopeId,
  toConvergenceOutput,
  type ConvergenceConstraint,
  type ConvergenceInput,
  type ConvergenceOutput,
  type ConvergenceRunId,
  type ConvergenceScope,
  type ConvergenceStage,
} from './types';
import { normalizeLimit, toResult, type ResultState } from '@shared/core';
import { buildTopologySnapshot, type TopologyRoute } from './topology';
import { collectIterable, chunkIterable, mapIterable } from '@shared/stress-lab-runtime';
import { createTenantId } from '@domain/recovery-stress-lab';

const allScopes = ['tenant', 'topology', 'signal', 'policy', 'fleet'] as const satisfies readonly ConvergenceScope[];

export type ConstraintMatrix<T extends readonly ConvergenceConstraint[]> = {
  [K in ConvergenceScope]: readonly T[number][];
};

export type ConvergenceConstraintDigest<T extends readonly ConvergenceConstraint[]> = {
  readonly runId: ConvergenceRunId;
  readonly ids: readonly (ConvergenceConstraint['id'])[];
  readonly payload: T;
};

export interface ConstraintEnvelope<T extends readonly ConvergenceConstraint[] = readonly ConvergenceConstraint[]> {
  readonly runId: ConvergenceRunId;
  readonly scopes: {
    readonly tenant: {
      readonly constraints: readonly T[number][];
      readonly total: number;
      readonly active: number;
    };
    readonly topology: {
      readonly constraints: readonly T[number][];
      readonly total: number;
      readonly active: number;
    };
    readonly signal: {
      readonly constraints: readonly T[number][];
      readonly total: number;
      readonly active: number;
    };
    readonly policy: {
      readonly constraints: readonly T[number][];
      readonly total: number;
      readonly active: number;
    };
    readonly fleet: {
      readonly constraints: readonly T[number][];
      readonly total: number;
      readonly active: number;
    };
  };
  readonly topologies: readonly TopologyRoute[];
  readonly diagnostics: readonly string[];
}

export interface ConstraintProfile<TScope extends ConvergenceScope> {
  readonly scope: TScope;
  readonly scopeLabel: `${TScope}Scope`;
  readonly constraintCount: number;
  readonly activeRate: number;
  readonly fingerprint: string;
}

export interface ConstraintIndex {
  readonly bucketByScope: {
    readonly input: readonly { key: string; total: number; active: number; weight: number }[];
    readonly resolve: readonly { key: string; total: number; active: number; weight: number }[];
    readonly simulate: readonly { key: string; total: number; active: number; weight: number }[];
    readonly recommend: readonly { key: string; total: number; active: number; weight: number }[];
    readonly report: readonly { key: string; total: number; active: number; weight: number }[];
  };
  readonly orderedScopes: readonly ConvergenceScope[];
  readonly generatedAt: string;
}

type ConstraintEntry = {
  key: string;
  total: number;
  active: number;
  weight: number;
};

const scopeBuckets = (constraints: readonly ConvergenceConstraint[]): ConstraintMatrix<readonly ConvergenceConstraint[]> => {
  const buckets: ConstraintMatrix<readonly ConvergenceConstraint[]> = {
    tenant: [],
    topology: [],
    signal: [],
    policy: [],
    fleet: [],
  };

  for (const constraint of constraints) {
    buckets[constraint.scope] = [...buckets[constraint.scope], constraint];
  }

  return buckets;
};

export const buildConstraintMatrix = <
  TConstraints extends readonly ConvergenceConstraint[],
>(constraints: TConstraints): ConstraintMatrix<TConstraints> => {
  const grouped = scopeBuckets(constraints) as ConstraintMatrix<TConstraints>;
  return {
    tenant: grouped.tenant,
    topology: grouped.topology,
    signal: grouped.signal,
    policy: grouped.policy,
    fleet: grouped.fleet,
  };
};

const normalizeWeight = (weight: number): number => {
  const normalized = Math.max(0, Math.min(1, weight));
  return Math.round(normalized * normalizeLimit(100)) / 100;
};

export const buildConstraintProfiles = (
  constraints: readonly ConvergenceConstraint[],
): readonly ConstraintProfile<ConvergenceScope>[] => {
  const matrix = buildConstraintMatrix(constraints);

  return allScopes.map((scope) => {
    const scoped = matrix[scope];
    const count = scoped.length;
    const active = scoped.filter((entry) => entry.active).length;
    return {
      scope,
      scopeLabel: `${scope}Scope`,
      constraintCount: count,
      activeRate: count === 0 ? 0 : active / count,
      fingerprint: `${scope}:${count}:${active}`,
    };
  });
};

export const normalizeConvergenceConstraints = <
  TConstraints extends readonly ConvergenceConstraint[],
>(constraints: TConstraints): TConstraints => {
  return constraints.map((constraint) => ({
    ...constraint,
    weight: normalizeWeight(constraint.weight),
  })) as unknown as TConstraints;
};

export const reifyEnvelope = <
  T extends readonly ConvergenceConstraint[],
>(
  runId: ConvergenceRunId,
  constraints: T,
  topologies: readonly TopologyRoute[],
  diagnostics: readonly string[],
): ConstraintEnvelope<T> => {
  const matrix = buildConstraintMatrix(constraints);

  return {
    runId,
    scopes: {
      tenant: {
        constraints: matrix.tenant,
        total: matrix.tenant.length,
        active: matrix.tenant.filter((entry) => entry.active).length,
      },
      topology: {
        constraints: matrix.topology,
        total: matrix.topology.length,
        active: matrix.topology.filter((entry) => entry.active).length,
      },
      signal: {
        constraints: matrix.signal,
        total: matrix.signal.length,
        active: matrix.signal.filter((entry) => entry.active).length,
      },
      policy: {
        constraints: matrix.policy,
        total: matrix.policy.length,
        active: matrix.policy.filter((entry) => entry.active).length,
      },
      fleet: {
        constraints: matrix.fleet,
        total: matrix.fleet.length,
        active: matrix.fleet.filter((entry) => entry.active).length,
      },
    },
    topologies,
    diagnostics,
  };
};

const stageByScope = (scope: ConvergenceScope): ConvergenceStage =>
  scope === 'tenant'
    ? 'input'
    : scope === 'topology'
      ? 'resolve'
      : scope === 'signal'
        ? 'simulate'
        : scope === 'policy'
          ? 'recommend'
          : 'report';

export const bucketByStage = (constraints: readonly ConvergenceConstraint[]): Record<ConvergenceStage, readonly ConstraintEntry[]> => {
  const buckets: {
    input: ConstraintEntry[];
    resolve: ConstraintEntry[];
    simulate: ConstraintEntry[];
    recommend: ConstraintEntry[];
    report: ConstraintEntry[];
  } = {
    input: [],
    resolve: [],
    simulate: [],
    recommend: [],
    report: [],
  };

  for (const constraint of constraints) {
    const scopeStage = stageByScope(constraint.scope);
    const bucket = buckets[scopeStage];
    const existing = bucket.find((entry) => entry.key === constraint.key);
    if (existing) {
      existing.total += 1;
      existing.weight += constraint.weight;
      existing.active += constraint.active ? 1 : 0;
      continue;
    }

    bucket.push({
      key: constraint.key,
      total: 1,
      active: constraint.active ? 1 : 0,
      weight: constraint.weight,
    });
  }

  return {
    input: bucketWeightSort(buckets.input),
    resolve: bucketWeightSort(buckets.resolve),
    simulate: bucketWeightSort(buckets.simulate),
    recommend: bucketWeightSort(buckets.recommend),
    report: bucketWeightSort(buckets.report),
  };
};

const bucketWeightSort = (entries: ConstraintEntry[]): readonly ConstraintEntry[] =>
  entries
    .map((entry) => ({
      ...entry,
      weight: Math.max(0, entry.weight),
    }))
    .toSorted((left, right) => right.weight - left.weight);

export const buildConstraintSummary = (constraints: readonly ConvergenceConstraint[]): ConstraintIndex => ({
  bucketByScope: bucketByStage(constraints),
  orderedScopes: allScopes.toSorted((left, right) => right.length - left.length),
  generatedAt: new Date().toISOString(),
});

export const splitByChunk = (
  constraints: readonly ConvergenceConstraint[],
  chunkSize: number,
): readonly { key: string; readonly active: number; readonly total: number }[] => {
  const chunks = chunkIterable(constraints, Math.max(1, normalizeLimit(chunkSize)));
  return collectIterable(
    mapIterable(chunks, (chunk) => ({
      key: `${chunk.at(0)?.id ?? 'none'}-${chunk.at(-1)?.id ?? 'none'}`,
      active: chunk.filter((entry) => entry.active).length,
      total: chunk.length,
    })),
  );
};

export const compareConstraintSets = (
  left: readonly ConvergenceConstraint[],
  right: readonly ConvergenceConstraint[],
): readonly { key: string; readonly delta: number }[] => {
  const leftMap = new Map<string, number>(left.map((entry) => [entry.key, entry.weight] as const));
  const rightMap = new Map<string, number>(right.map((entry) => [entry.key, entry.weight] as const));
  const keys = new Set<string>([...leftMap.keys(), ...rightMap.keys()]);

  return collectIterable(
    mapIterable(keys, (key) => ({
      key,
      delta: (rightMap.get(key) ?? 0) - (leftMap.get(key) ?? 0),
    })),
  ).toSorted((leftValue, rightValue) => Math.abs(rightValue.delta) - Math.abs(leftValue.delta));
};

export const indexConstraint = <TInput extends ConvergenceInput>(
  input: TInput,
  constraints: readonly ConvergenceConstraint[],
): ConvergenceOutput => {
  const normalized = normalizeConvergenceConstraints(constraints);
  const topology = buildTopologySnapshot({
    topology: {
      tenantId: input.tenantId,
      nodes: input.topology.nodes,
      edges: input.topology.edges,
    },
  });

  const envelope = reifyEnvelope(
    input.runId,
    normalized,
    topology.routes,
    [],
  );
  const active =
    envelope.scopes.tenant.active +
    envelope.scopes.topology.active +
    envelope.scopes.signal.active +
    envelope.scopes.policy.active +
    envelope.scopes.fleet.active;

  return toConvergenceOutput(
    input,
    input.stage,
    (normalized.length + active) / Math.max(1, topology.routes.length + 3),
    [
      ...envelope.scopes.tenant.constraints.map((item) => `tenant:${item.key}`),
      ...envelope.scopes.topology.constraints.map((item) => `topology:${item.key}`),
      ...envelope.scopes.signal.constraints.map((item) => `signal:${item.key}`),
      ...envelope.scopes.policy.constraints.map((item) => `policy:${item.key}`),
      ...envelope.scopes.fleet.constraints.map((item) => `fleet:${item.key}`),
    ],
  );
};

export const buildConvergenceConstraintDigest = <T extends readonly ConvergenceConstraint[]>(
  constraints: T,
  runId: ConvergenceRunId,
): ConvergenceConstraintDigest<T> => ({
  runId,
  ids: constraints.map((constraint) => constraint.id),
  payload: constraints,
});

export const buildConstraintKeys = <T extends readonly ConvergenceConstraint[]>(
  constraints: T,
): readonly `${ConvergenceScope}:${string}`[] => {
  return collectIterable(
    mapIterable(constraints, (constraint) => `${constraint.scope}:${constraint.key}` as const),
  );
};

export const buildConstraintEnvelopeTrace = async (
  tenantId: string,
  constraints: readonly ConvergenceConstraint[],
): Promise<ConstraintEnvelope<readonly ConvergenceConstraint[]>> => {
  const tenant = createTenantId(tenantId);
  const runId = createConvergenceRunId(tenant, 'constraints');
  const topologies = buildTopologySnapshot({
    topology: {
      tenantId: tenant,
      nodes: [],
      edges: [],
    },
  });
  const constraintOutput = indexConstraint(
    {
      runId,
      tenantId: tenant,
      stage: 'input',
      scope: 'tenant',
      topology: {
        tenantId: tenant,
        nodes: [],
        edges: [],
      },
      signals: [],
      anchorConstraints: constraints,
      basePlan: null,
      activeRunbooks: [],
      baseline: createEnvelopeId(runId, 'input'),
      requestedAt: new Date().toISOString(),
    },
    constraints,
  );

  return {
    runId,
    scopes: {
      tenant: {
        constraints,
        total: constraints.filter((entry) => entry.scope === 'tenant').length,
        active: constraints.filter((entry) => entry.scope === 'tenant' && entry.active).length,
      },
      topology: {
        constraints,
        total: constraints.filter((entry) => entry.scope === 'topology').length,
        active: constraints.filter((entry) => entry.scope === 'topology' && entry.active).length,
      },
      signal: {
        constraints,
        total: constraints.filter((entry) => entry.scope === 'signal').length,
        active: constraints.filter((entry) => entry.scope === 'signal' && entry.active).length,
      },
      policy: {
        constraints,
        total: constraints.filter((entry) => entry.scope === 'policy').length,
        active: constraints.filter((entry) => entry.scope === 'policy' && entry.active).length,
      },
      fleet: {
        constraints,
        total: constraints.filter((entry) => entry.scope === 'fleet').length,
        active: constraints.filter((entry) => entry.scope === 'fleet' && entry.active).length,
      },
    },
    topologies: topologies.routes,
    diagnostics: [
      `constraints:${constraints.length}`,
      `score:${constraintOutput.score.toFixed(3)}`,
    ],
  };
};

export const constraintEnvelopeToResult = (
  constraints: readonly ConvergenceConstraint[],
  tenantId: string,
): Promise<ResultState<ConstraintEnvelope<readonly ConvergenceConstraint[]>, Error>> => {
  return toResult(async () => buildConstraintEnvelopeTrace(tenantId, constraints));
};

export const createConstraintChain = (
  tenantId: string,
  scopes: readonly ConvergenceScope[] = allScopes,
): readonly ConvergenceConstraint[] =>
  scopes.flatMap((scope) =>
    [
      createConstraintId(scope, `${tenantId}:${scope}:baseline`),
      createConstraintId(scope, `${tenantId}:${scope}:runtime`),
      createConstraintId(scope, `${tenantId}:${scope}:signal`),
    ].map((constraintId, index) => ({
      id: constraintId,
      scope,
      key: `${scope}:seed:${index}`,
      weight: 0.5 - index * 0.1,
      active: index !== 2,
    })),
  );

export const constraintProfiles = (constraints: readonly ConvergenceConstraint[]): readonly ConstraintProfile<ConvergenceScope>[] =>
  buildConstraintProfiles(constraints);
