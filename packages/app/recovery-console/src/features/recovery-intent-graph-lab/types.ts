import type { Brand } from '@shared/type-level';
import type { IntentGraphSnapshot, IntentNodeDef, IntentEdge, IntentSignal } from '@shared/recovery-intent-graph-runtime';
import { makeNamespacedId } from '@shared/recovery-intent-graph-runtime';

export type IntentLabTenantId = Brand<string, 'TenantId'>;
export type IntentLabWorkspaceId = Brand<string, 'WorkspaceId'>;

export type IntentLabRoute = `intent-graph-lab/${'overview' | 'topology' | 'signals' | 'adapters'}`;

export type IntentStatus = 'idle' | 'warming' | 'running' | 'draining' | 'failed' | 'completed';

export interface IntentLabNode {
  readonly id: string;
  readonly kind: IntentNodeDef['kind'];
  readonly title: string;
  readonly score: number;
  readonly payload: Record<string, unknown>;
}

export interface IntentLabEdge {
  readonly from: string;
  readonly to: string;
  readonly weight: number;
}

export type IntentRoute = `intent:${'bootstrap' | 'classify' | 'resolve' | 'observe'}`;

export const intentRouteUnion = [
  'intent:bootstrap',
  'intent:classify',
  'intent:resolve',
  'intent:observe',
] as const satisfies readonly IntentRoute[];

export const isIntentRoute = (value: string): value is IntentRoute =>
  (intentRouteUnion as readonly string[]).includes(value);

export interface IntentLabWorkspace {
  readonly tenant: IntentLabTenantId;
  readonly workspace: IntentLabWorkspaceId;
  readonly namespace: ReturnType<typeof makeNamespacedId>;
  readonly route: IntentRoute;
}

export interface IntentLabWorkspaceState extends IntentLabWorkspace {
  readonly status: IntentStatus;
  readonly active: boolean;
  readonly nodes: readonly IntentLabNode[];
  readonly edges: readonly IntentLabEdge[];
  readonly pluginNames: readonly string[];
  readonly signalCount: number;
  readonly messages: readonly string[];
  readonly route: IntentRoute;
}

export interface IntentLabSignalRow extends Omit<IntentSignal, 'tenant' | 'workspace'> {
  readonly tenant: string;
  readonly workspace: string;
}

export interface IntentPluginSummary {
  readonly name: string;
  readonly route: string;
  readonly latencyMs: number;
  readonly canRun: boolean;
}

export interface IntentRouteState {
  readonly route: string;
  readonly nodes: readonly IntentLabNode[];
  readonly edges: readonly IntentLabEdge[];
  readonly signals: readonly IntentLabSignalRow[];
  readonly plugins: readonly IntentPluginSummary[];
}

export interface WorkspaceSummary {
  readonly route: string;
  readonly routeNodes: number;
  readonly routeEdges: number;
  readonly score: number;
  readonly topologicalDepth: number;
}

export interface IntentFormState {
  readonly tenant: string;
  readonly workspace: string;
  readonly selectedRoute: IntentRoute;
  readonly throttleMs: number;
  readonly includeDiagnostics: boolean;
}

export const makeDefaultState = (): IntentLabWorkspaceState => ({
  tenant: 'tenant/default' as IntentLabTenantId,
  workspace: 'workspace/default' as IntentLabWorkspaceId,
  namespace: makeNamespacedId('intent-lab', 'runtime'),
  route: 'intent:bootstrap',
  status: 'idle',
  active: false,
  nodes: [],
  edges: [],
  pluginNames: [],
  signalCount: 0,
  messages: [],
});

export const makeDefaultFormState = (tenant: string, workspace: string): IntentFormState => ({
  tenant,
  workspace,
  selectedRoute: intentRouteUnion[0],
  throttleMs: 250,
  includeDiagnostics: true,
});

export const intentLabRouteFor = (route: IntentRoute): IntentLabRoute =>
  `intent-graph-lab/${route.replace('intent:', '')}` as IntentLabRoute;

export const makeRouteLabel = (route: IntentRoute): string => route.toUpperCase();

export const toIntentNodeRows = (snapshot: IntentGraphSnapshot<unknown>): readonly IntentLabNode[] =>
  snapshot.nodes.map((node) => ({
    id: node.id as string,
    kind: node.kind,
    title: node.title,
    score: node.score,
    payload: node.payload as Record<string, unknown>,
  }));

export const toIntentEdges = (snapshot: IntentGraphSnapshot<unknown>): readonly IntentLabEdge[] =>
  snapshot.edges.map((edge) => ({
    from: edge.from as string,
    to: edge.to as string,
    weight: Number(edge.weight),
  }));

export const toWorkspaceSummary = ({ name, nodes, edges, tags }: IntentGraphSnapshot<unknown>): WorkspaceSummary => ({
  route: tags.route ?? name,
  routeNodes: nodes.length,
  routeEdges: edges.length,
  score: tags.score ? Number(tags.score) : nodes.length * 1.2,
  topologicalDepth: Math.max(0, nodes.length - edges.length),
});

export const workspaceStateToString = (state: IntentLabWorkspaceState): string =>
  `${state.tenant}:${state.workspace}|${state.route}|${state.status}|${state.nodes.length}:${state.edges.length}`;
