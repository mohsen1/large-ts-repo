import {
  asChronicleGraphEdgeId,
  asChronicleGraphNodeId,
  asChronicleGraphPlanId,
  asChronicleGraphPhase,
  asChronicleGraphRoute,
  asChronicleGraphTenantId,
  asChronicleGraphLane,
  validateScenarioInput,
  type ChronicleGraphBlueprint,
  type ChronicleGraphScenario,
  type ChronicleGraphPlanId,
  type ChronicleGraphRoute,
  type ChronicleGraphSignal,
  type ChronicleGraphTenantId,
  type ChronicleGraphPhase,
  type ChronicleGraphEdge,
} from '@domain/recovery-chronicle-graph-core';

export interface ResolvedScenario {
  readonly scenarioId: ChronicleGraphPlanId;
  readonly tenant: ChronicleGraphTenantId;
  readonly route: ChronicleGraphRoute;
  readonly phases: readonly ChronicleGraphPhase[];
  readonly title: string;
  readonly scenario: ChronicleGraphScenario;
}

export const resolveGraphScenario = (
  tenant: string,
  route: string,
  phases: readonly ChronicleGraphPhase[],
): ResolvedScenario => {
  const resolvedTenant = asChronicleGraphTenantId(tenant);
  const resolvedRoute = asChronicleGraphRoute(route);
  const scenarioId = asChronicleGraphPlanId(`${resolvedTenant}:${resolvedRoute}`);

  return {
    scenarioId,
    tenant: resolvedTenant,
    route: resolvedRoute,
    phases,
    title: `${tenant}:${route}`,
    scenario: normalizeGraphScenario(resolvedTenant, resolvedRoute, phases).scenario,
  };
};

const toBlueprintFromPhases = (
  tenant: ChronicleGraphTenantId,
  route: ChronicleGraphRoute,
  phases: readonly ChronicleGraphPhase[],
): ChronicleGraphBlueprint => {
  const routeSuffix = String(route).replace('chronicle-graph://', '');
  const nodes = phases.map((phase, index) => ({
    id: asChronicleGraphNodeId(`graph-${routeSuffix}-${index}`),
    name: String(phase).replace('phase:', ''),
    lane: asChronicleGraphLane(index % 2 === 0 ? 'control' : 'policy'),
    dependsOn:
      index === 0 ? [] : [asChronicleGraphNodeId(`graph-${routeSuffix}-${index - 1}`)],
    labels: { phase: String(phase), index, tenant },
  }));

  const edges = nodes
    .slice(1)
    .map((node, index) => {
      const previous = nodes[index];
      return {
        id: asChronicleGraphEdgeId(`edge-${previous.id}-${node.id}`),
        from: previous.id,
        to: node.id,
        weight: index + 1,
        predicates: [String(node.lane)],
      };
    });

  return {
    id: asChronicleGraphPlanId(`${tenant}:${route}`),
    tenant,
    route,
    title: `Scenario ${tenant}`,
    description: `Generated for ${route}`,
    nodes,
    edges,
  };
};

export const normalizeGraphScenario = (
  tenant: string | ChronicleGraphTenantId,
  route: string | ChronicleGraphRoute,
  phases: readonly ChronicleGraphPhase<string>[],
): { scenario: ChronicleGraphScenario } => {
  const resolvedTenant = typeof tenant === 'string' ? asChronicleGraphTenantId(tenant) : tenant;
  const resolvedRoute = typeof route === 'string' ? asChronicleGraphRoute(route) : route;
  const effectivePhases = phases.length > 0 ? phases : [asChronicleGraphPhase('bootstrap')];
  const fallback = validateScenarioInput({
    tenant: String(resolvedTenant).replace('tenant:', ''),
    route: String(resolvedRoute),
    title: `${String(resolvedRoute).replace('chronicle-graph://', '')} scenario`,
    priorities: effectivePhases.map((phase) => String(phase).replace('phase:', '')),
    expectedSeconds: 120,
  });

  if (fallback) {
    return { scenario: fallback };
  }

  const priorities = effectivePhases.map((phase) =>
    String(phase).replace('phase:', '') as ChronicleGraphSignal,
  );

  return {
    scenario: {
      id: asChronicleGraphPlanId(`${resolvedTenant}:${resolvedRoute}`),
      tenant: resolvedTenant,
      route: resolvedRoute,
      title: `${String(resolvedRoute).replace('chronicle-graph://', '')}`,
      priorities,
      axis: {
        throughput: 1,
        resilience: 1,
        cost: 0.5,
        operational: 0.8,
      },
      expectedSeconds: 120,
      blueprint: toBlueprintFromPhases(resolvedTenant, resolvedRoute, effectivePhases),
    },
  };
};

export const buildGraphDescriptor = (blueprint: ChronicleGraphBlueprint): {
  readonly title: string;
  readonly phases: readonly string[];
  readonly route: ChronicleGraphRoute;
  readonly tenant: ChronicleGraphTenantId;
} => ({
  title: blueprint.title,
  phases: blueprint.nodes.map((node) => String(node.name)),
  route: blueprint.nodes.at(0) ? blueprint.route : asChronicleGraphRoute('studio'),
  tenant: blueprint.tenant,
});

export const buildTimelineTokens = (
  tenant: ChronicleGraphTenantId,
  route: ChronicleGraphRoute,
): readonly string[] => [String(tenant), String(route), new Date().toISOString()];

export const hydrateRunId = (tenant: ChronicleGraphTenantId, route: ChronicleGraphRoute): string => `${tenant}:${route}`;

export const buildPluginLabel = (value: unknown): string => {
  if (typeof value === 'string') return `plugin:${value}`;
  if (value && typeof value === 'object' && 'id' in value) {
    return `plugin:${String((value as { id: string }).id)}`;
  }
  return 'plugin:unknown';
};
