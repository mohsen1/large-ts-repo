import {
  buildConvergenceLatticeManifest,
  buildBlueprint,
  buildLatticePlugin,
  createConstraintArtifacts,
  runLatticePlugin,
  type LatticePlugin,
  type LatticePluginInput,
} from './typed-lattice';
import {
  createConvergenceRunId,
  createConstraintId,
  createEnvelopeId,
  toConvergenceOutput,
  type ConvergenceConstraint,
  type ConvergenceInput,
  type ConvergenceOutput,
  type ConvergenceRunId,
  type ConvergenceScope,
  type ConvergenceStage,
} from './types';
import { buildTopologySnapshot, type TopologyRoute } from './topology';
import {
  buildConstraintProfiles,
  buildConstraintSummary,
  buildConvergenceConstraintDigest,
  buildConstraintEnvelopeTrace,
  buildConstraintKeys,
} from './constraint-lattice';
import { createTenantId } from '@domain/recovery-stress-lab';

export interface StageManifest {
  readonly key: string;
  readonly tenantId: string;
  readonly stage: ConvergenceStage;
  readonly scope: ConvergenceScope;
  readonly plugins: readonly string[];
  readonly constraints: readonly ConvergenceConstraint[];
}

export interface CompilerManifest {
  readonly tenantId: string;
  readonly scopeOrder: readonly ConvergenceScope[];
  readonly stageOrder: readonly ConvergenceStage[];
  readonly pluginCount: number;
  readonly pluginIds: readonly string[];
}

export interface ChainInput<TInput extends ConvergenceInput> {
  readonly tenantId: string;
  readonly scope: TInput['scope'];
  readonly stage: TInput['stage'];
  readonly constraints: readonly ConvergenceConstraint[];
  readonly topology: {
    readonly nodes: readonly string[];
    readonly edges: readonly string[];
  };
}

type NoInfer<T> = [T][T extends any ? 0 : never];

export interface CompileResult<TInput extends ConvergenceInput> {
  readonly input: TInput;
  readonly plugin: LatticePlugin<TInput>;
  readonly route: readonly ConvergenceStage[];
  readonly constraintKeys: readonly string[];
  readonly manifest: StageManifest;
}

const routeForScope = (scope: ConvergenceScope): readonly ConvergenceStage[] =>
  scope === 'tenant'
    ? ['input', 'resolve', 'simulate', 'recommend', 'report']
    : scope === 'topology'
      ? ['resolve', 'simulate', 'recommend']
      : scope === 'signal'
        ? ['simulate', 'recommend', 'report']
        : scope === 'policy'
          ? ['recommend', 'report']
          : ['input', 'report'];

const scopeTag = (scope: ConvergenceScope): string =>
  scope === 'tenant'
    ? 'tenant'
    : scope === 'topology'
      ? 'topology'
      : scope === 'signal'
        ? 'signal'
        : scope === 'policy'
          ? 'policy'
          : 'fleet';

const buildStageManifest = <TInput extends ConvergenceInput>(
  tenantId: string,
  input: TInput,
  stage: ConvergenceStage,
  constraints: readonly ConvergenceConstraint[],
  pluginCount: number,
): StageManifest => {
  const key = createConvergenceRunId(input.tenantId, `${scopeTag(input.scope)}:${stage}:${Date.now()}`);

  return {
    key,
    tenantId,
    stage,
    scope: input.scope,
    plugins: Array.from({ length: pluginCount }, (_, index) => `${key}:${index}`),
    constraints: [...constraints],
  };
};

export const compileLatticeChain = <
  TInput extends ConvergenceInput,
  const TStages extends readonly ConvergenceStage[],
>(
  input: TInput,
  stages: NoInfer<TStages>,
  constraints: readonly ConvergenceConstraint[] = [],
  tenantId: string = input.tenantId,
): { readonly chain: readonly CompileResult<TInput>[]; readonly route: readonly ConvergenceStage[] } => {
  const route = routeForScope(input.scope).filter((entry) => stages.includes(entry));
  const blueprint = buildBlueprint(input.tenantId, input.scope, route, constraints, 'compiler');

  const chain = route.map((stage) => {
    const plugin = buildLatticePlugin<TInput, TInput['scope']>(input.scope, stage, blueprint);
    return {
      input,
      plugin,
      route,
      constraintKeys: buildConstraintKeys(constraints),
      manifest: buildStageManifest(tenantId, input, stage, constraints, route.length),
    };
  });

  return { chain, route };
};

const nextContextHint = (scope: ConvergenceScope, stage: ConvergenceStage, index: number): string =>
  `${scope}:${stage}:${index}`;

const buildRuntimeInput = (
  input: ConvergenceInput,
  stage: ConvergenceStage,
  output: ConvergenceOutput,
): ConvergenceInput => ({
  ...input,
  stage,
  signals: input.signals,
  activeRunbooks: output.selectedRunbooks,
  baseline: createEnvelopeId(input.runId, stage),
  requestedAt: new Date().toISOString(),
});

export const compileAndExecute = async <TInput extends ConvergenceInput>(
  input: TInput,
  constraints: readonly ConvergenceConstraint[] = [],
): Promise<{
  readonly runId: ConvergenceRunId;
  readonly manifest: CompilerManifest;
  readonly output: ConvergenceOutput;
  readonly diagnostics: readonly string[];
}> => {
  const route = routeForScope(input.scope);
  const topology = buildTopologySnapshot({
    topology: {
      tenantId: input.tenantId,
      nodes: [],
      edges: [],
    },
  });

  const blueprint = buildBlueprint(input.tenantId, input.scope, route, constraints, 'runtime');
  let output = toConvergenceOutput(input, input.stage, 0, ['runtime:start']);
  const pluginIds: string[] = [];

  let currentInput: ConvergenceInput = input;
  let payload: LatticePluginInput<ConvergenceInput> = {
    contextHint: nextContextHint(input.scope, route[0] ?? 'input', 0),
    nodeCount: blueprint.nodes.length,
    edgeCount: blueprint.edges.length,
    input: currentInput,
  };

  for (const [index, stage] of route.entries()) {
    const plugin = buildLatticePlugin<ConvergenceInput, ConvergenceInput['scope']>(input.scope, stage, blueprint);
    pluginIds.push(plugin.id);
    const pluginOutput = await runLatticePlugin(plugin, payload);

    output = pluginOutput.output;
    currentInput = buildRuntimeInput(input, stage, output);
    payload = {
      contextHint: nextContextHint(input.scope, stage, index),
      nodeCount: blueprint.nodes.length + index,
      edgeCount: blueprint.edges.length + index,
      input: currentInput,
    };
  }

  const diagnostics = buildConstraintProfiles(constraints);
  const manifestSummary = buildConstraintSummary(constraints);
  const digest = buildConvergenceConstraintDigest(constraints, createConvergenceRunId(input.tenantId, 'digest'));

  return {
    runId: createConvergenceRunId(input.tenantId, `${input.scope}:compiler`),
    manifest: {
      tenantId: input.tenantId,
      scopeOrder: [input.scope],
      stageOrder: route,
      pluginCount: route.length,
      pluginIds,
    },
    output: {
      ...output,
      diagnostics: [
        ...output.diagnostics,
        `profiles:${diagnostics.length}`,
        `byScope:${manifestSummary.orderedScopes.length}`,
        `digest:${digest.ids.length}`,
        `routes:${topology.routes.length}`,
      ],
    },
    diagnostics: [
      `plugins:${route.length}`,
      `scopes:${manifestSummary.orderedScopes.join('|')}`,
      `diagnostics:${manifestSummary.bucketByScope.input.length}`,
    ],
  };
};

export const buildCompilerManifest = async (
  tenantId: string,
  scopes: readonly ConvergenceScope[] = ['tenant', 'topology', 'signal', 'policy', 'fleet'],
): Promise<readonly CompilerManifest[]> => {
  const tenant = createTenantId(tenantId);
  const results: CompilerManifest[] = [];

  for (const scope of scopes) {
    const manifest = buildConvergenceLatticeManifest(tenant, [scope]);
    const constraints = createConstraintArtifacts(createConvergenceRunId(tenant, `${scope}:compiler`), scope);
    const seededInput = createConvergenceRunId(tenant, `${scope}:input`);

    const input: ConvergenceInput<'input'> = {
      runId: seededInput,
      tenantId: tenant,
      scope,
      stage: 'input',
      topology: {
        tenantId: tenant,
        nodes: [],
        edges: [],
      },
      signals: [],
      anchorConstraints: [
        {
          id: createConstraintId(scope, `${tenant}:anchor:${scope}`),
          scope,
          key: `${scope}:anchor`,
          weight: 1,
          active: true,
        },
        ...constraints,
      ],
      basePlan: null,
      activeRunbooks: [],
      baseline: createEnvelopeId(seededInput, 'input'),
      requestedAt: new Date().toISOString(),
    };

    const output = await compileAndExecute(input, [
      {
        id: createConstraintId(scope, `${tenant}:manifest`),
        scope,
        key: `${scope}:base`,
        weight: 1,
        active: true,
      },
      ...constraints,
    ]);

    results.push({
      tenantId,
      scopeOrder: [scope],
      stageOrder: routeForScope(scope),
      pluginCount: manifest.length + output.manifest.pluginCount,
      pluginIds: [...manifest.map((entry) => `${tenant}:${entry.scope}`), ...output.manifest.pluginIds],
    });
  }

  return results;
};

export interface CompilerAudit {
  readonly tenantId: string;
  readonly manifestCount: number;
  readonly pluginCount: number;
  readonly routeCount: number;
  readonly routeSignatures: readonly string[];
}

export const compileAudit = async (
  tenantId: string,
  scope: ConvergenceScope,
  constraints: readonly ConvergenceConstraint[] = [],
): Promise<CompilerAudit> => {
  const topology = buildTopologySnapshot({
    topology: {
      tenantId: createTenantId(tenantId),
      nodes: [],
      edges: [],
    },
  });
  const routes = buildConvergenceLatticeManifest(createTenantId(tenantId), [scope], routeForScope(scope), constraints);
  const signatures = routes.map((entry) => `${entry.scope}:${entry.route}:${entry.nodeCount}`);

  return {
    tenantId,
    manifestCount: routes.length,
    pluginCount: routes.reduce((acc, entry) => acc + entry.labels.length, 0) + topology.routes.length,
    routeCount: routeForScope(scope).length,
    routeSignatures: signatures,
  };
};

export const runLatticeCompileChain = async <
  TInput extends ConvergenceInput,
>(
  input: TInput,
  constraints: readonly ConvergenceConstraint[] = [],
): Promise<ConvergenceOutput> => {
  const topology = buildTopologySnapshot({
    topology: {
      tenantId: input.tenantId,
      nodes: input.topology.nodes,
      edges: input.topology.edges,
    },
  });
  const envelope = await buildConstraintEnvelopeTrace(input.tenantId, constraints);
  const route = routeForScope(input.scope);
  const blueprint = buildBlueprint(input.tenantId, input.scope, route, envelope.scopes.tenant.constraints, 'runtime');

  let output: ConvergenceOutput = toConvergenceOutput(
    input,
    input.stage,
    0.4,
    ['runtime-bootstrap', `scope:${input.scope}`],
  );
  let currentInput: ConvergenceInput = input;
  let payload: LatticePluginInput<ConvergenceInput> = {
    contextHint: `runtime:${input.scope}:start`,
    nodeCount: blueprint.nodes.length,
    edgeCount: blueprint.edges.length,
    input,
  };

  for (const [index, stage] of route.entries()) {
    const plugin = buildLatticePlugin<ConvergenceInput, ConvergenceInput['scope']>(input.scope, stage, blueprint);
    const result = await runLatticePlugin(plugin, payload);

    output = {
      ...output,
      ...result.output,
      diagnostics: [...output.diagnostics, `runtime:${index}`, result.latticeDigest],
      selectedRunbooks: result.output.selectedRunbooks,
    };

    currentInput = buildRuntimeInput(currentInput, stage, result.output);
    payload = {
      contextHint: `runtime:${stage}:${index + 1}`,
      nodeCount: payload.nodeCount + 1,
      edgeCount: payload.edgeCount + 1,
      input: currentInput,
    };
  }

  return {
    ...output,
    diagnostics: [...output.diagnostics, `routes:${topology.routes.length}`, `constraints:${constraints.length}`],
  };
};

export const topologyRunSummaries = <TInput extends ConvergenceInput>(
  input: TInput,
  routes: readonly TopologyRoute[],
): readonly string[] =>
  routes.map((route) => `${route.from}->${route.to}:${route.hops.toFixed(2)}:${route.path.length}`);
