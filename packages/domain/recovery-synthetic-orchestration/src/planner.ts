import { asIterable, toIterator, sequenceState } from './iterator';
import { syntheticDomain, syntheticPhases, syntheticBuildDefaults, type SyntheticPriorityBand } from './constants';
import type {
  PluginChainCompatibility,
  PluginByName,
  SyntheticBlueprint,
  SyntheticExecutionContext,
  SyntheticPluginDefinition,
  SyntheticRunId,
  SyntheticPlan,
  SyntheticPlanRequest,
  PluginChainInput,
} from './contracts';
import {
  syntheticRunPrefix,
  buildRuntimeContext,
  buildPlanRequest,
  asSyntheticBlueprintId,
  asSyntheticRunId,
  asSyntheticTenantId,
  asSyntheticWorkspaceId,
  asSyntheticCorrelationId,
} from './contracts';

export interface PlannerOptions {
  readonly maxPlugins?: number;
  readonly includePhases?: readonly SyntheticBlueprint['phases'][number][];
  readonly timeoutMs?: number;
  readonly priority?: SyntheticPriorityBand;
}

export interface BuildResult<TPlugins extends readonly SyntheticPluginDefinition[]> {
  readonly request: SyntheticPlanRequest<TPlugins>;
  readonly context: SyntheticExecutionContext;
  readonly plan: SyntheticPlan<TPlugins>;
}

const planSeed = `${syntheticRunPrefix}${Date.now()}`;

export const normalizeBlueprintPhases = (
  blueprint: Pick<SyntheticBlueprint, 'phases'>,
  options: PlannerOptions = {},
): readonly SyntheticBlueprint['phases'][number][] => {
  const include = new Set(options.includePhases ?? syntheticPhases);
  return blueprint.phases.filter((phase) => include.has(phase));
};

export const buildExecutionPlan = <TPlugins extends readonly SyntheticPluginDefinition[]>(
  blueprint: SyntheticBlueprint,
  plugins: PluginChainCompatibility<TPlugins>,
  options: PlannerOptions = {},
): BuildResult<TPlugins> => {
  const runId = asSyntheticRunId(`${planSeed}:${crypto.randomUUID()}`);
  const context = buildRuntimeContext({
    tenantId: asSyntheticTenantId(blueprint.tenantId),
    workspaceId: asSyntheticWorkspaceId(blueprint.workspaceId),
    runId,
    correlationId: asSyntheticCorrelationId(`${blueprint.id}:correlation`),
    actor: blueprint.requestedBy,
  });

  const normalized = normalizeBlueprintPhases(blueprint, options);
  const chain = asIterable(plugins)
    .filter((plugin) => normalized.includes(plugin.phase))
    .toArray();

  const limited = [...chain]
    .sort((left: SyntheticPluginDefinition, right: SyntheticPluginDefinition) => {
      if (left.weight === right.weight) {
        return left.id.localeCompare(right.id);
      }
      return left.weight - right.weight;
    })
    .slice(0, options.maxPlugins ?? chain.length) as unknown as PluginChainCompatibility<TPlugins>;

  const request = buildPlanRequest(
    {
      blueprintId: asSyntheticBlueprintId(blueprint.id),
      runId,
      requestedBy: blueprint.requestedBy,
      plugins: limited,
    },
    'tenantId',
  );

  const requestPlan: SyntheticPlan<TPlugins> = {
    runId,
    phases: normalized,
    pluginChain: limited,
    createdAt: context.startedAt,
    domain: syntheticDomain,
  };

  return { request, context, plan: requestPlan };
};

export const buildOrderedInputSequence = <T>(values: readonly T[]): readonly T[] => {
  const states = sequenceState(values);
  return states
    .filter((state) => !state.done)
    .toSorted((left, right) => left.index - right.index)
    .map((state) => state.value);
};

export const buildPlanPreview = <TPlugins extends readonly SyntheticPluginDefinition[]>(
  request: SyntheticPlanRequest<TPlugins>,
): {
  readonly pluginNames: readonly string[];
  readonly expectedPhaseCount: number;
  readonly inputShape: PluginChainInput<TPlugins>;
  readonly version: string;
} => {
  const ordered = toIterator(request.plugins as readonly TPlugins[number][])
    .map((plugin) => plugin.name)
    .toArray();

  return {
    pluginNames: ordered,
    expectedPhaseCount: request.plan.phases.length,
    inputShape: undefined as unknown as PluginChainInput<TPlugins>,
    version: planSeed,
  };
};
