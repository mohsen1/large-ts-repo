import {
  canonicalizeNamespace,
  PluginDefinition,
  PluginContext,
  PluginRegistry,
  type PluginDependency,
  type PluginKind,
  type PluginNamespace,
} from '@shared/stress-lab-runtime';
import {
  buildConvergencePluginId,
  buildConvergencePluginVersion,
  createConvergenceRunId,
  createConstraintId,
  createEnvelopeId,
  toConvergenceOutput,
  toPluginKind,
  type ConvergenceConstraint,
  type ConvergenceInput,
  type ConvergenceOutput,
  type ConvergenceRunId,
  type ConvergenceScope,
  type ConvergenceStage,
} from './types';
import { createTenantId, type TenantId } from '@domain/recovery-stress-lab';
import { normalizeLimit, type Brand, withBrand } from '@shared/core';

type NoInfer<T> = [T][T extends any ? 0 : never];

type EmptyTuple = readonly [];

export type RouteTail<TInput extends readonly ConvergenceStage[]> = TInput extends readonly [
  infer Head extends ConvergenceStage,
  ...infer Tail extends readonly ConvergenceStage[],
]
  ? `${Head}${Tail extends EmptyTuple ? '' : `/${RouteTail<Tail>}`}`
  : '';

export type LatticeNodePrefix<TScope extends ConvergenceScope, TStage extends ConvergenceStage> = `${TScope}-${TStage}-node`;

export interface LatticeNode<
  TScope extends ConvergenceScope = ConvergenceScope,
  TStage extends ConvergenceStage = ConvergenceStage,
> {
  readonly id: LatticeNodeId;
  readonly scope: TScope;
  readonly stage: TStage;
  readonly label: LatticeNodePrefix<TScope, TStage>;
  readonly constraints: readonly ConvergenceConstraint[];
  readonly weight: number;
}

export interface LatticeEdge {
  readonly from: LatticeNodeId;
  readonly to: LatticeNodeId;
  readonly capacity: number;
  readonly delay: number;
}

export interface LatticeBlueprint<
  TScope extends ConvergenceScope = ConvergenceScope,
  TStages extends readonly ConvergenceStage[] = typeof latticeStages,
> {
  readonly namespace: PluginNamespace;
  readonly scope: TScope;
  readonly runSeed: string;
  readonly stages: TStages;
  readonly nodes: readonly LatticeNode<TScope, ConvergenceStage>[];
  readonly edges: readonly LatticeEdge[];
  readonly labels: readonly string[];
}

export interface LatticeManifest {
  readonly id: LatticeManifestId;
  readonly scope: ConvergenceScope;
  readonly route: RouteTail<readonly ConvergenceStage[]>;
  readonly namespace: PluginNamespace;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly labels: readonly string[];
  readonly generatedAt: string;
}

export interface LatticePluginInput<TInput extends ConvergenceInput = ConvergenceInput> {
  readonly contextHint: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly input: TInput;
}

export interface LatticePluginOutput<TInput extends ConvergenceInput = ConvergenceInput> {
  readonly output: ConvergenceOutput<TInput['stage']>;
  readonly latticeScope: ConvergenceScope;
  readonly latticePath: RouteTail<readonly ConvergenceStage[]>;
  readonly latticeDigest: string;
}

export type LatticePlugin<TInput extends ConvergenceInput = ConvergenceInput> = PluginDefinition<
  LatticePluginInput<TInput>,
  LatticePluginOutput<TInput>,
  {
    readonly seed: ConvergenceRunId;
    readonly scope: ConvergenceScope;
  },
  PluginKind
>;

export type LatticeNodeId = Brand<string, 'LatticeNodeId'>;
export type LatticeManifestId = Brand<string, 'LatticeManifestId'>;

export const latticeStages = ['input', 'resolve', 'simulate', 'recommend', 'report'] as const satisfies readonly ConvergenceStage[];
export const supportedScopes = ['tenant', 'topology', 'signal', 'policy', 'fleet'] as const satisfies readonly ConvergenceScope[];

const latticeNamespace = canonicalizeNamespace('recovery:lab:lattice');
const asNodeId = (value: string): LatticeNodeId => withBrand(value, 'LatticeNodeId');
const asManifestId = (value: string): LatticeManifestId => withBrand(value, 'LatticeManifestId');

const scopeDependencies = (scope: ConvergenceScope): readonly PluginDependency[] =>
  [`dep:recovery-lab-orchestration-core`, `dep:${scope}`] as const;

const normalizeStages = <TStages extends readonly ConvergenceStage[]>(stages: TStages): TStages =>
  (stages.length === 0 ? latticeStages : stages) as TStages;

const buildNode = <
  TScope extends ConvergenceScope,
  TStage extends ConvergenceStage,
>(
  scope: TScope,
  stage: TStage,
  index: number,
  constraints: readonly ConvergenceConstraint[],
): LatticeNode<TScope, TStage> => ({
  id: asNodeId(`${latticeNamespace}:${scope}:${stage}:${index}`),
  scope,
  stage,
  label: `${scope}-${stage}-node` as LatticeNodePrefix<TScope, TStage>,
  constraints: constraints.filter((entry) => entry.scope === scope),
  weight: normalizeLimit(index + constraints.length) / 100,
});

const buildEdge = <TScope extends ConvergenceScope>(
  from: LatticeNode<TScope>,
  to: LatticeNode<TScope>,
  index: number,
): LatticeEdge => ({
  from: from.id,
  to: to.id,
  capacity: Math.max(1, to.label.length + from.label.length),
  delay: Math.max(1, normalizeLimit(index + 1) / 10),
});

const buildRoute = (stages: readonly ConvergenceStage[]): RouteTail<readonly ConvergenceStage[]> =>
  stages.join('/') as RouteTail<readonly ConvergenceStage[]>;

export const buildBlueprint = <
  TScope extends ConvergenceScope,
  TStages extends readonly ConvergenceStage[] = typeof latticeStages,
>(
  tenantId: TenantId,
  scope: TScope,
  stages: TStages,
  constraints: readonly ConvergenceConstraint[] = [],
  seed = 'seed',
): LatticeBlueprint<TScope, TStages> => {
  const resolvedStages = normalizeStages(stages);
  const namespace = canonicalizeNamespace(`recovery:lab:blueprint:${tenantId}:${seed}`);
  const nodes = resolvedStages.flatMap((stage, index) => [
    buildNode(scope, stage, index * 2, constraints),
    buildNode(scope, stage, index * 2 + 1, constraints),
  ]) as readonly LatticeNode<TScope, ConvergenceStage>[];
  const edges: LatticeEdge[] = [];

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const left = nodes[index];
    const right = nodes[index + 1];
    if (left && right) {
      edges.push(buildEdge(left, right, index));
    }
  }

  return {
    namespace,
    scope,
    runSeed: `${tenantId}::${scope}::${seed}::${Date.now()}`,
    stages: resolvedStages,
    nodes,
    edges,
    labels: nodes.map((node) => node.label),
  };
};

export const buildManifest = <
  TScope extends ConvergenceScope,
  TStages extends readonly ConvergenceStage[],
>(blueprint: LatticeBlueprint<TScope, TStages>): LatticeManifest => ({
  id: asManifestId(`${blueprint.runSeed}:manifest`),
  scope: blueprint.scope,
  route: buildRoute(blueprint.stages),
  namespace: blueprint.namespace,
  nodeCount: blueprint.nodes.length,
  edgeCount: blueprint.edges.length,
  labels: [...blueprint.labels],
  generatedAt: new Date().toISOString(),
});

export const buildLatticePlugin = <
  TInput extends ConvergenceInput,
  TScope extends ConvergenceScope,
>(
  scope: TScope,
  stage: ConvergenceStage,
  blueprint: LatticeBlueprint<TScope, readonly ConvergenceStage[]>,
  stageHint = stage,
): LatticePlugin<TInput> => {
  const namespace = canonicalizeNamespace(`recovery:lab:plugin:${blueprint.runSeed}`);
  const manifest = buildManifest(blueprint);
  const runId = createConvergenceRunId(createTenantId(blueprint.runSeed), `${scope}:${stageHint}`);

  return {
    id: buildConvergencePluginId(namespace, scope, stageHint, 'typed-lattice'),
    name: `typed-lattice-${scope}-${stageHint}`,
    namespace,
    kind: toPluginKind(scope, stageHint),
    version: buildConvergencePluginVersion(),
    tags: ['typed-lattice', scope, stageHint, ...manifest.labels] as const,
    dependencies: scopeDependencies(scope),
    config: {
      seed: runId,
      scope,
    },
    run: async (
      _context: PluginContext<{ seed: ConvergenceRunId; scope: ConvergenceScope }>,
      input: LatticePluginInput<TInput>,
    ): Promise<
      | {
          ok: true;
          value: LatticePluginOutput<TInput>;
          generatedAt: string;
        }
      | { ok: false; errors: readonly string[]; generatedAt: string }
    > => {
      const payload = toConvergenceOutput(
        input.input,
        stageHint,
        stageHint === 'input'
          ? 0.91
          : stageHint === 'resolve'
            ? 0.77
            : stageHint === 'simulate'
              ? 0.67
              : stageHint === 'recommend'
                ? 0.58
                : 0.49,
        [
          `run:${input.input.runId}`,
          `scope:${scope}`,
          `digest:${input.contextHint}`,
          `nodes:${input.nodeCount}`,
          `edges:${input.edgeCount}`,
          ...manifest.labels,
        ],
      );

      return {
        ok: true,
        value: {
          output: {
            ...payload,
            simulation: null,
            selectedRunbooks: input.input.activeRunbooks,
            signalDigest: {
              input: input.input.signals.length,
              resolve: input.nodeCount,
              simulate: input.edgeCount,
              recommend: input.input.anchorConstraints.length,
              report: input.contextHint.length,
            },
          },
          latticeScope: scope,
          latticePath: manifest.route,
          latticeDigest: `${manifest.id}:${runId}`,
        },
        generatedAt: new Date().toISOString(),
      };
    },
  };
};

export const createConstraintArtifacts = (
  runId: ConvergenceRunId,
  scope: ConvergenceScope,
): readonly ConvergenceConstraint[] => {
  const baseline = createEnvelopeId(runId, 'input');

  return [
    {
      id: createConstraintId(scope, `${baseline}:baseline`),
      scope,
      key: `${scope}:baseline`,
      weight: 0.5,
      active: true,
    },
    {
      id: createConstraintId(scope, `${baseline}:signal`),
      scope,
      key: `${scope}:signal`,
      weight: 0.3,
      active: true,
    },
    {
      id: createConstraintId(scope, `${baseline}:runtime`),
      scope,
      key: `${scope}:runtime`,
      weight: 0.2,
      active: false,
    },
  ];
};

export const buildConvergenceLatticeManifest = (
  tenantId: TenantId,
  scopeOverrides: readonly ConvergenceScope[] = supportedScopes,
  stageOverrides: readonly ConvergenceStage[] = latticeStages,
  constraints: readonly ConvergenceConstraint[] = [],
): readonly LatticeManifest[] =>
  scopeOverrides.map((scope) => {
    const blueprint = buildBlueprint(tenantId, scope, stageOverrides, constraints, scope);
    return buildManifest(blueprint);
  });

export const buildLatticeRegistry = (
  tenantId: TenantId,
  scope: ConvergenceScope,
  stages: readonly ConvergenceStage[] = latticeStages,
  constraints: readonly ConvergenceConstraint[] = [],
): PluginRegistry => {
  const registry = PluginRegistry.create(canonicalizeNamespace(`recovery:lab-registry:${tenantId}:${scope}`));
  const blueprint = buildBlueprint(tenantId, scope, stages, constraints, 'registry');
  const pluginStages = stages.length ? stages : latticeStages;

  for (const stage of pluginStages) {
    const plugin = buildLatticePlugin<TypedLatticeInput, ConvergenceScope>(scope, stage, blueprint);
    void plugin;
    registry.register(plugin);
  }

  return registry;
};

type TypedLatticeInput = ConvergenceInput<'input'>;

export const buildLatticeRuntimeContext = <T>(
  value: T,
  scope: ConvergenceScope,
): PluginContext<{ seed: ConvergenceRunId; payload: T; scope: ConvergenceScope }> => ({
  tenantId: createTenantId('tenant:recovery-lab-orchestration'),
  requestId: `run:${Date.now()}`,
  namespace: latticeNamespace,
  startedAt: new Date().toISOString(),
  config: {
    seed: createConvergenceRunId(createTenantId('tenant:recovery-lab-orchestration'), `${scope}:runtime`),
    payload: value,
    scope,
  },
});

export const runLatticePlugin = async <
  TInput extends ConvergenceInput,
>(
  plugin: LatticePlugin<TInput>,
  input: LatticePluginInput<TInput>,
): Promise<LatticePluginOutput<TInput>> => {
  const context = buildLatticeRuntimeContext(input, input.input.scope);
  const output = await plugin.run(context, input);
  if (!output.ok || output.value === undefined) {
    throw new Error(output.errors?.join(',') ?? 'lattice plugin failed');
  }
  return output.value;
};

const makeScopeDiagnostics = (scope: ConvergenceScope, constraints: readonly ConvergenceConstraint[]) => {
  const scopeDiagnostics = constraints
    .filter((constraint) => constraint.scope === scope)
    .map((constraint) => `${scope}:${constraint.key}`);

  return scopeDiagnostics;
};

export const buildManifestCatalog = async (
  tenantId: TenantId,
  scopes: readonly ConvergenceScope[] = supportedScopes,
): Promise<readonly LatticeManifest[]> => {
  const manifests = await Promise.all(
    scopes.map(async (scope) => {
      const base = buildConvergenceLatticeManifest(tenantId, [scope], latticeStages, createConstraintArtifacts(createConvergenceRunId(tenantId, `${scope}:catalog`), scope));
      return base.flatMap((entry) => ({
        ...entry,
        labels: [...entry.labels, ...makeScopeDiagnostics(scope, createConstraintArtifacts(createConvergenceRunId(tenantId, `${scope}:catalog`), scope))],
      }));
    }),
  );

  return manifests.flat();
};
