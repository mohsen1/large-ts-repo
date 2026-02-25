import { asPolicyId, asTenantId, composeNamespace, type NamespaceTag, type PolicyId, type TenantId } from './identifiers';
import { asHealthScore, type EcosystemPlan, type EcosystemSeverity, type StageConfig, type StageDependency } from './models';
import type { JsonObject } from '@shared/type-level';

export type WorkspaceLane = 'intent' | 'execution' | 'verification' | 'recovery';
export type WorkspaceHealthState = 'unknown' | 'warning' | 'healthy' | 'critical';

export type WorkspaceId = `workspace:${string}`;
export type WorkspaceTenant = `tenant:${string}` & TenantId;
export interface WorkspacePolicy<TName extends string = string> {
  readonly id: PolicyId;
  readonly name: TName;
  readonly enabled: boolean;
  readonly weight: number;
  readonly tags: readonly `tag:${string}`[];
}

export interface WorkspacePlanNode<TName extends string = string, TPayload extends JsonObject = JsonObject> {
  readonly id: `${TName}:${string}`;
  readonly lane: WorkspaceLane;
  readonly config: StageConfig;
  readonly payload: TPayload;
}

export interface WorkspaceGraph {
  readonly namespace: NamespaceTag;
  readonly tenant: TenantId;
  readonly roots: readonly WorkspacePlanNode[];
  readonly leaves: readonly WorkspacePlanNode[];
  readonly edges: readonly { from: WorkspacePlanNode['id']; to: WorkspacePlanNode['id']; weight: number }[];
}

export interface WorkspaceSummary {
  readonly workspace: WorkspaceId;
  readonly tenant: WorkspaceTenant;
  readonly laneCount: number;
  readonly policies: readonly WorkspacePolicy[];
  readonly health: WorkspaceHealthState;
  readonly score: ReturnType<typeof asHealthScore>;
  readonly generatedAt: string;
}

export type WorkspaceManifest<TName extends string = string> = {
  readonly name: TName;
  readonly namespace: NamespaceTag;
  readonly policies: readonly WorkspacePolicy[];
  readonly lanes: readonly WorkspaceLane[];
  readonly plan: EcosystemPlan;
};

export type WorkspacePolicyMap<TPolicies extends readonly WorkspacePolicy[]> = {
  [Policy in TPolicies[number] as Policy['id'] extends string ? Policy['id'] : never]: Policy;
};

export type PolicyIndexTuple<TValues extends readonly string[]> =
  TValues extends readonly [infer Head, ...infer Tail]
    ? Head extends string
      ? Tail extends readonly string[]
        ? readonly [Head, ...PolicyIndexTuple<Tail>]
        : never
      : never
    : readonly [];

export type LaneSignature<TLane extends WorkspaceLane> = `${TLane}:${string}`;
export type SeveritySuffix<TSeverity extends EcosystemSeverity> = `${TSeverity}-severity`;

export const WORKSPACE_LANES: readonly WorkspaceLane[] = ['intent', 'execution', 'verification', 'recovery'];

export interface WorkspaceInput {
  readonly tenantId: string;
  readonly namespace: string;
  readonly activePolicies: readonly string[];
  readonly overrides: Readonly<Record<string, string>>;
}

export interface WorkspaceBuildResult {
  readonly workspace: WorkspaceManifest;
  readonly graph: WorkspaceGraph;
  readonly summary: WorkspaceSummary;
}

const normalizeLaneWeight = (lane: WorkspaceLane): number =>
  lane === 'intent' ? 10 : lane === 'execution' ? 25 : lane === 'verification' ? 20 : 35;

export const parseWorkspaceId = (value: string): WorkspaceId =>
  `workspace:${value.replace(/^workspace:/, '').trim()}` as WorkspaceId;

const now = (): string => new Date().toISOString();

export const buildWorkspaceNodes = (
  tenant: string,
  namespace: string,
  plan: EcosystemPlan,
  policies: readonly WorkspacePolicy[],
): WorkspaceBuildResult => {
  const workspace = parseWorkspaceId(`${tenant}:${namespace}`);
  const tenantId = asTenantId(tenant);
  const namespaceTag = composeNamespace('namespace', namespace) as NamespaceTag;

  const lanes: readonly WorkspaceLane[] = WORKSPACE_LANES.toSorted((left, right) => normalizeLaneWeight(left) - normalizeLaneWeight(right));
  const laneMap = new Map<WorkspaceLane, WorkspacePlanNode[]>();

  const nodes = plan.phases.map((phase, index) => {
    const lane = lanes[index % lanes.length] ?? 'execution';
    const node: WorkspacePlanNode = {
      id: `${phase.id}:${index}` as WorkspacePlanNode['id'],
      lane,
      config: phase,
      payload: {
        phase: phase.name,
        plugin: phase.plugin,
      },
    };
    const bucket = laneMap.get(lane) ?? [];
    bucket.push(node);
    laneMap.set(lane, bucket);
    return node;
  });

  const edges = nodes
    .flatMap((node, index) =>
      (plan.phases[index]?.dependsOn ?? []).map((dependency) => {
        const from = `${dependency}:${index}` as WorkspacePlanNode['id'];
        const to = node.id;
        return { from, to, weight: dependency.length };
      }),
    )
    .toSorted((left, right) => left.weight - right.weight);

  const roots = nodes.filter((node) => node.config.dependsOn.length === 0);
  const leaves = nodes.filter((node) =>
    !edges.some((edge) => edge.from === node.id) && edges.some((edge) => edge.to === node.id),
  );

  const healthyPolicyCount = policies.filter((entry) => entry.enabled).length;
  const score = asHealthScore(Math.min(100, Math.max(0, healthyPolicyCount * 12 + lanes.length * 5)));

  const summary: WorkspaceSummary = {
    workspace,
    tenant: `tenant:${tenant}` as WorkspaceTenant,
    laneCount: lanes.length,
    policies,
    health: score >= 80 ? 'healthy' : score >= 40 ? 'warning' : 'critical',
    score,
    generatedAt: now(),
  };

  return {
    workspace: {
      name: workspace,
      namespace: namespaceTag,
      policies,
      lanes,
      plan,
    },
    graph: {
      namespace: namespaceTag,
      tenant: tenantId,
      roots: roots.toSorted((left, right) =>
        String(left.payload.phase).localeCompare(String(right.payload.phase)),
      ),
      leaves: leaves.toSorted((left, right) =>
        String(left.payload.phase).localeCompare(String(right.payload.phase)),
      ),
      edges,
    },
    summary,
  };
};

export const normalizeDependencies = (dependencies: readonly StageDependency[]): Readonly<Record<string, readonly string[]>> => {
  const output: Record<string, readonly string[]> = {};
  for (const dependency of dependencies) {
    const key = dependency.to;
    output[key] = [...(output[key] ?? []), dependency.from];
  }
  return output as Readonly<Record<string, readonly string[]>>;
};

export const policyWeight = (policy: WorkspacePolicy): number =>
  policy.enabled ? Math.max(1, policy.weight) : 0;

export const workspaceDigest = (
  workspace: WorkspaceManifest,
  graph: WorkspaceGraph,
): {
  readonly id: WorkspaceId;
  readonly depth: number;
  readonly policyCount: number;
  readonly branchCount: number;
} => ({
  id: parseWorkspaceId(`workspace:${workspace.name}`),
  depth: graph.edges.length + workspace.policies.length,
  policyCount: graph.edges.length === 0 ? 0 : graph.edges[0].from.length,
  branchCount: graph.roots.length + graph.leaves.length,
});

export const workspacePolicy = (id: string, enabled = true): WorkspacePolicy => ({
  id: asPolicyId(id),
  name: id,
  enabled,
  weight: enabled ? 10 : 0,
  tags: ['tag:default'],
});

export const workspacePolicies = (names: readonly string[]): readonly WorkspacePolicy[] =>
  names
    .toSorted()
    .map((name) => workspacePolicy(name, true));

export const mergePolicyWeights = (
  policies: readonly WorkspacePolicy[],
): Record<WorkspacePolicy['id'], number> =>
  Object.fromEntries(policies.map((policy) => [policy.id, policyWeight(policy)]));
