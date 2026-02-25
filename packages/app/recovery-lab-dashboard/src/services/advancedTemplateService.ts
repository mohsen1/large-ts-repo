import { makeNodeId, makeStepId, type GraphStep } from '@domain/recovery-lab-synthetic-orchestration';
import { makePluginId } from '@shared/lab-graph-runtime';
import { type PluginContext, type PluginDefinition } from '@shared/stress-lab-runtime/plugin-registry';
import {
  CascadeRegistry,
  collectKindGroups,
  hydrateCascadeCatalog,
} from '@shared/stress-lab-runtime/cascade-registry';
import {
  canonicalizeNamespace,
  buildPluginId,
  type PluginDependency,
  type PluginKind,
} from '@shared/stress-lab-runtime/ids';
import {
  buildPlanId,
  buildRuntimeId,
  buildStepId,
  canonicalRuntimeNamespace,
  toWorkspaceDigest,
  type WorkspaceNamespace,
} from '@shared/stress-lab-runtime/advanced-lab-core';

export interface BlueprintTemplate<TMode extends string = string> {
  readonly id: string;
  readonly tenantId: string;
  readonly scenarioId: string;
  readonly namespace: WorkspaceNamespace;
  readonly mode: TMode;
  readonly tags: readonly string[];
  readonly labels: readonly string[];
}

export interface TemplatePlan {
  readonly templateId: string;
  readonly steps: readonly string[];
  readonly runbook: readonly BlueprintTemplate[];
}

interface BlueprintSeed {
  readonly namespace: WorkspaceNamespace;
  readonly kind: PluginKind;
  readonly phase: string;
}

const seedNamespace = canonicalRuntimeNamespace('dev:interactive:console');
const runtimeRegistryNamespace = 'recovery:lab:runtime' as const;

const templateSeeds = [
  {
    namespace: seedNamespace,
    kind: 'stress-lab/runtime',
    phase: 'discovery',
  },
  {
    namespace: seedNamespace,
    kind: 'stress-lab/dispatch',
    phase: 'dispatch',
  },
  {
    namespace: seedNamespace,
    kind: 'stress-lab/telemetry',
    phase: 'telemetry',
  },
] as const satisfies readonly BlueprintSeed[];

const templateToSteps = (tenantId: string, template: BlueprintTemplate, offset: number): readonly GraphStep<string>[] =>
  template.tags.map((tag, index) => ({
    id: makeStepId(`${tenantId}-${template.id}-${tag}-${offset + index}`),
    name: `${template.id}:${tag}`,
    node: makeNodeId(`${template.id}-${tag}`),
    plugin: makePluginId(`${template.id}:${offset + index}`),
    phase: `${template.namespace}:${template.id}:${index}`,
    intensity: 'calm',
    estimatedMs: index * 17 + offset,
  }));

const createTemplatePlugins = (): readonly PluginDefinition<unknown, unknown, { readonly phase: string }, PluginKind>[] => {
  return templateSeeds.map((entry, index) =>
    ({
      id: buildPluginId(canonicalizeNamespace(entry.namespace), entry.kind, `${entry.phase}::${index}`),
      name: `${entry.phase}-plugin`,
      namespace: canonicalizeNamespace(entry.namespace),
      kind: entry.kind,
      version: '1.0.0',
      tags: ['seed', entry.phase],
      dependencies: ['dep:recovery:stress:lab'] as readonly PluginDependency[],
      config: { phase: entry.phase },
      run: async (_context: PluginContext<{ phase: string }>, input: unknown) => ({
        ok: true,
        value: { ...(input as Record<string, unknown>), phase: _context.config.phase },
        generatedAt: new Date().toISOString(),
      }),
    }) satisfies PluginDefinition<unknown, unknown, { phase: string }, PluginKind>,
  );
};

const pluginDefinitions = createTemplatePlugins();
const registry = CascadeRegistry.create(canonicalizeNamespace(runtimeRegistryNamespace));
for (const definition of pluginDefinitions) {
  registry.register(definition);
}

const groupedPlugins = collectKindGroups(pluginDefinitions);

export const buildTemplateBlueprints = (tenantId: string, count: number): readonly BlueprintTemplate[] => {
  const templates: BlueprintTemplate[] = [];
  for (let index = 0; index < count; index++) {
    const namespace =
      index % 3 === 0
        ? canonicalRuntimeNamespace('dev:interactive:console')
        : index % 3 === 1
          ? canonicalRuntimeNamespace('dev:interactive:api')
          : canonicalRuntimeNamespace('dev:batch:scheduler');
    const mode = index % 3 === 0 ? 'interactive' : index % 3 === 1 ? 'streaming' : 'simulation';
    templates.push({
      id: `${tenantId}-tpl-${String(index).padStart(3, '0')}`,
      tenantId,
      scenarioId: `${tenantId}-scenario-${String(index).padStart(3, '0')}`,
      namespace,
      mode,
      tags: ['generated', mode, String(index)],
      labels: [`tenant:${tenantId}`, `index:${index}`, `namespace:${namespace}`],
    });
  }
  return templates;
};

export const compileTemplatePlan = (tenantId: string, scenarioId: string, index: number): TemplatePlan => {
  const templates = buildTemplateBlueprints(tenantId, 4);
  const selected = templates[index % templates.length];
  const steps = templateToSteps(tenantId, selected, index).map((step) => step.id);
  return {
    templateId: `${tenantId}-${scenarioId}-${index}`,
    steps,
    runbook: [
      selected,
      {
        ...selected,
        id: `${selected.id}-extended`,
        scenarioId: `${selected.scenarioId}-extended`,
        mode: selected.mode,
        tags: [...selected.tags, 'extended'],
        labels: [...selected.labels, `parent:${selected.id}`],
      },
    ],
  };
};

export const buildBlueprintInput = (
  tenantId: string,
  scenarioId: string,
  count: number,
): { readonly tenantId: string; readonly namespace: WorkspaceNamespace; readonly scenarioId: string; readonly graphSteps: readonly GraphStep<string>[] } => {
  const templates = buildTemplateBlueprints(tenantId, Math.max(1, count));
  const allSteps = templates.flatMap((template, index) => templateToSteps(tenantId, template, index));
  return {
    tenantId,
    namespace: templates[0]?.namespace ?? canonicalRuntimeNamespace('dev:interactive:console'),
    scenarioId,
    graphSteps: allSteps,
  };
};

export const buildTemplateStudioBlueprint = (input: {
  tenantId: string;
  namespace: WorkspaceNamespace;
  scenarioId: string;
  graphSteps: readonly GraphStep<string>[];
}) => {
  const planId = buildPlanId(input.tenantId, input.namespace, input.scenarioId);
  return {
    namespace: input.namespace,
    planId,
    planDigest: toWorkspaceDigest({
      namespace: input.namespace,
      planId,
      createdAt: Date.now(),
      version: 2,
      steps: input.graphSteps.map((step, index) => buildStepId(planId, step.phase, index)),
      plugins: input.graphSteps.map((step) => String(step.plugin)),
    }),
    runId: buildRuntimeId(input.tenantId, `template-${input.scenarioId}`, input.namespace),
    steps: input.graphSteps.map((step, index) => buildStepId(planId, step.phase, index)),
  };
};

export const createTemplateBlueprint = (tenantId: string) => {
  const input = buildBlueprintInput(tenantId, 'template', 3);
  return buildTemplateStudioBlueprint(input);
};

export const planDigestFromTemplate = (input: {
  tenantId: string;
  scenarioId: string;
  graphSteps: readonly GraphStep<string>[];
  namespace: WorkspaceNamespace;
}) => {
  const template = buildTemplateStudioBlueprint(input);
  return template.planDigest;
};

export const hydratePlugins = <TLimit extends number>(limit: TLimit): CascadeRegistry<string> => {
  const seeded = CascadeRegistry.create(canonicalizeNamespace(runtimeRegistryNamespace));
  for (const definition of pluginDefinitions.slice(0, limit)) {
    seeded.register(definition);
  }
  return seeded;
};

export const blueprintCatalogSummary = {
  count: pluginDefinitions.length,
  namespaces: [...new Set(pluginDefinitions.map((plugin) => plugin.namespace))],
  kinds: Object.keys(groupedPlugins),
  fingerprint: registry.snapshot().namespace,
} as const;

export { templateToSteps, templateSeeds, pluginDefinitions, groupedPlugins };
