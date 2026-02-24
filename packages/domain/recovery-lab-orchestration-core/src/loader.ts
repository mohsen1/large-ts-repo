import { canonicalizeNamespace } from '@shared/stress-lab-runtime';
import {
  buildConvergenceRunId,
  createConvergenceRunId,
  createEnvelopeId,
  type ConvergenceConstraint,
  type ConvergenceInput,
  type ConvergenceScope,
  type ConvergenceRunId,
  type ConvergenceStage,
  toConvergenceOutput,
  normalizeConstraints,
} from './types';
import { scenarioBlueprints, type ScenarioTemplate } from './scenarios';
import { buildConvergencePlugin, ConvergencePluginCatalog, registerConvergenceDefaults } from './registry';
import { createTenantId, type TenantId, type WorkloadTopology } from '@domain/recovery-stress-lab';
import type { PluginContext } from '@shared/stress-lab-runtime';

export interface LoaderManifest {
  readonly templates: readonly ScenarioTemplate[];
  readonly loadedAt: string;
}

export interface LoadedCatalogInput {
  readonly runId: ConvergenceRunId;
  readonly scope: ConvergenceScope;
}

export interface ConvergenceCatalogManifest {
  readonly plugins: readonly string[];
  readonly namespaces: readonly string[];
  readonly loadedAt: string;
}

const loadedTemplates = [...scenarioBlueprints];

const allScopes = ['tenant', 'topology', 'signal', 'policy', 'fleet'] as const satisfies readonly ConvergenceScope[];

const templatesByScope = new Map<ConvergenceScope, readonly ScenarioTemplate[]>(
  allScopes.map((scope): [ConvergenceScope, readonly ScenarioTemplate[]] => {
    const entries = loadedTemplates.filter((entry) => entry.scope === scope);
    return [scope, entries];
  }),
);

export const loadBuiltinManifests = async (): Promise<LoaderManifest> => ({
  templates: [...loadedTemplates],
  loadedAt: new Date().toISOString(),
});

const scopedConstraints = (scope: ConvergenceScope): readonly ConvergenceConstraint[] =>
  templatesByScope.get(scope)?.flatMap((entry) => entry.constraints) ?? [];

const buildStagePlugin = (
  scope: ConvergenceScope,
  stage: ConvergenceStage,
) => {
  return buildConvergencePlugin({
    scope,
    stage,
    name: `${scope}-${stage}`,
    tags: ['orchestration', scope, stage],
    dependencies: ['dep:recovery:stress:lab'],
    pluginConfig: {
      namespace: canonicalizeNamespace('recovery:lab:orchestration'),
      scope,
      stage,
      config: {
        normalized: true,
      },
    },
    run: async (_context: PluginContext<Record<string, unknown>>, input: ConvergenceInput<typeof stage>) => ({
      ok: true,
      value: toConvergenceOutput(
        input,
        stage,
        stage === 'input' ? 0.81 : stage === 'resolve' ? 0.77 : stage === 'simulate' ? 0.68 : stage === 'recommend' ? 0.52 : 0.44,
        [`seed:${scope}`, `plugin:${stage}`, `constraints:${scopedConstraints(scope).length}`],
      ),
      generatedAt: new Date().toISOString(),
    }),
  });
};

const bootstrapCatalog = new ConvergencePluginCatalog(
  buildConvergenceRunId(createTenantId('tenant:recovery-lab-orchestration'), 'bootstrap'),
  canonicalizeNamespace('recovery:lab-orchestration-core'),
  ['input', 'resolve', 'simulate', 'recommend', 'report'],
);

for (const scope of allScopes) {
  bootstrapCatalog.registerMany([
    buildStagePlugin(scope, 'input'),
    buildStagePlugin(scope, 'resolve'),
    buildStagePlugin(scope, 'simulate'),
    buildStagePlugin(scope, 'recommend'),
    buildStagePlugin(scope, 'report'),
  ]);
}

registerConvergenceDefaults(bootstrapCatalog, canonicalizeNamespace('recovery:lab-orchestration-core'));

export { bootstrapCatalog };

export const buildConvergenceManifest = async (): Promise<ConvergenceCatalogManifest> => {
  const manifest = bootstrapCatalog.manifest();
  return {
    plugins: manifest.pluginCount ? bootstrapCatalog.list().map((entry) => String(entry.id)) : [],
    namespaces: [...new Set([bootstrapCatalog.namespace])],
    loadedAt: new Date().toISOString(),
  };
};

export const createInputFromTopology = (tenantId: TenantId, topology: WorkloadTopology): ConvergenceInput<'input'> => ({
  runId: createConvergenceRunId(tenantId, 'loader'),
  tenantId,
  scope: 'tenant',
  stage: 'input',
  topology,
  signals: [],
  anchorConstraints: [],
  basePlan: null,
  activeRunbooks: [],
  baseline: createEnvelopeId(createConvergenceRunId(tenantId, 'baseline'), 'input'),
  requestedAt: new Date().toISOString(),
});

export const createTenantRunInput = (tenantId: TenantId, topology: WorkloadTopology, scope: ConvergenceScope): ConvergenceInput<'input'> => ({
  runId: createConvergenceRunId(tenantId, `loader:${scope}`),
  tenantId,
  scope,
  stage: 'input',
  topology,
  signals: [],
  anchorConstraints: normalizeConstraints(scopedConstraints(scope)),
  basePlan: null,
  activeRunbooks: [],
  baseline: createEnvelopeId(createConvergenceRunId(tenantId, scope), 'input'),
  requestedAt: new Date().toISOString(),
});

export const loadConvergenceTemplates = async (): Promise<readonly ScenarioTemplate[]> => {
  const manifest = await loadBuiltinManifests();
  return [...manifest.templates].toSorted((left, right) => left.name.localeCompare(right.name));
};
