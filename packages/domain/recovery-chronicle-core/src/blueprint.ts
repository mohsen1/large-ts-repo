import {
  ChronicleBlueprint,
  ChronicleChannel,
  ChronicleEdge,
  ChronicleNode,
  ChroniclePlanId,
  ChronicleRoute,
  ChronicleTenantId,
  TimelineLane,
  asChronicleTag,
} from './types.js';

export interface ChronicleTemplatePhase {
  readonly phaseName: string;
  readonly lane: TimelineLane;
  readonly label: string;
  readonly weight: number;
}

export interface BlueprintLaneTemplate {
  readonly phaseName: string;
  readonly lane: TimelineLane;
  readonly label: string;
  readonly weight: number;
}

export interface BlueprintFactoryInput {
  readonly tenant: ChronicleTenantId;
  readonly title: string;
  readonly route: ChronicleRoute;
  readonly planId?: string;
  readonly tags: readonly string[];
  readonly template?: readonly ChronicleTemplatePhase[];
}

export interface BlueprintTemplate {
  readonly manifest: Omit<ChronicleBlueprint, 'plan' | 'tenant' | 'route' | 'tags'>;
  readonly phaseCount: number;
}

export const buildNode = (
  index: number,
  template: BlueprintLaneTemplate,
): ChronicleNode => ({
  id: `node-${template.phaseName}-${index}` as ChronicleNode['id'],
  label: template.label,
  lane: template.lane,
  dependencies: index === 0 ? [] : [`node-${template.phaseName}-${index - 1}` as ChronicleNode['id']],
});

export const buildEdges = (nodes: readonly ChronicleNode[]): readonly ChronicleEdge[] => {
  const edges: ChronicleEdge[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    edges.push({
      from: nodes[index - 1].id,
      to: nodes[index].id,
      weight: 1 + index * 0.25,
    });
  }
  return edges;
};

export const buildBlueprint = ({
  tenant,
  title,
  route,
  tags,
  template,
  planId,
}: BlueprintFactoryInput): ChronicleBlueprint => {
  const defaultTemplate: readonly ChronicleTemplatePhase[] = [
    { phaseName: 'bootstrap', lane: 'control', label: `${title} bootstrap`, weight: 1 },
    { phaseName: 'discover', lane: 'signal', label: `${title} discover`, weight: 1 },
    { phaseName: 'simulate', lane: 'policy', label: `${title} simulate`, weight: 1 },
    { phaseName: 'stabilize', lane: 'telemetry', label: `${title} stabilize`, weight: 1 },
    { phaseName: 'verify', lane: 'control', label: `${title} verify`, weight: 1 },
  ];

  const resolvedPlan = planId ? (`plan:${planId}` as ChroniclePlanId) : (`plan:${tenant}:${route}` as ChroniclePlanId);
  const source = template ?? defaultTemplate;
  const nodes = source
    .map((sourcePhase, index) => buildNode(index, sourcePhase))
    .toSorted((left, right) => left.label.localeCompare(right.label));
  const edges = buildEdges(nodes);

  return {
    name: `${title} blueprint`,
    description: `${title} generated from ${resolvedPlan}`,
    tenant,
    route,
    tags: tags.length === 0 ? [asChronicleTag('empty')] : tags.map((tag) => asChronicleTag(tag)),
    plan: resolvedPlan,
    phases: nodes,
    edges,
  };
};

export const composeBlueprint = (
  template: Omit<ChronicleBlueprint, 'plan'> & { plan?: string },
): ChronicleBlueprint => {
  const plan = `plan:${template.route}` as ChroniclePlanId;
  return {
    ...template,
    plan,
    tenant: template.tenant,
    route: template.route,
    tags: template.tags.length === 0 ? [asChronicleTag('empty')] : template.tags,
    phases: template.phases.toSorted((left, right) => left.label.localeCompare(right.label)),
    edges: [...template.edges],
  };
};

export const cloneNodeIds = (blueprint: ChronicleBlueprint): readonly ChronicleNode[] =>
  blueprint.phases.map((phase) => ({
    ...phase,
    id: `${blueprint.route}:${phase.id}` as ChronicleNode['id'],
    dependencies: [...phase.dependencies],
  }));

export const validateBlueprint = (value: unknown): value is ChronicleBlueprint => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.name !== 'string') return false;
  if (typeof candidate.tenant !== 'string') return false;
  if (typeof candidate.route !== 'string') return false;
  if (!Array.isArray(candidate.phases) || !Array.isArray(candidate.edges)) return false;
  return true;
};
