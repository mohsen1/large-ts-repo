import { z } from 'zod';
import { type GraphId, type NodeId, type EdgeId, type GraphDefinition, type GraphEdge } from '@domain/nebula-grid/src';
import { TopologyResolver, type TopologyValidationReport } from '@domain/nebula-grid/src/topology';

export const OrchestrationSchema = z.object({
  kind: z.literal('nebula-orchestration'),
  version: z.string(),
  tenant: z.string(),
  graphId: z.string(),
  policy: z.record(z.number()),
});

export type OrchestrationId = `orch-${string}`;
export type StepKind = 'validate' | 'compile' | 'deploy' | 'observe' | 'rollback' | 'audit';

export interface OrchestrationNode {
  readonly id: string;
  readonly kind: StepKind;
  readonly nodeId: NodeId;
  readonly dependsOn: ReadonlyArray<OrchestrationId>;
  readonly enabled: boolean;
  readonly weight: number;
  readonly script: string;
}

export interface OrchestrationEdge {
  readonly id: EdgeId;
  readonly from: OrchestrationId;
  readonly to: OrchestrationId;
  readonly condition: string;
}

export interface OrchestratorBlueprint {
  readonly id: OrchestrationId;
  readonly name: string;
  readonly graph: GraphId;
  readonly nodes: ReadonlyArray<OrchestrationNode>;
  readonly edges: ReadonlyArray<OrchestrationEdge>;
  readonly labels: Readonly<Record<string, string>>;
}

export interface OrchestrationManifest {
  readonly id: OrchestrationId;
  readonly project: string;
  readonly revision: number;
  readonly blueprint: OrchestratorBlueprint;
  readonly createdAt: number;
  readonly owner: string;
}

export interface OrchestrationRun {
  readonly id: OrchestrationId;
  readonly manifestId: OrchestrationId;
  readonly startedAt: number;
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed' | 'rolled-back';
  readonly attempts: number;
  readonly log: ReadonlyArray<string>;
}

export interface OrchestratorService {
  compile(input: OrchestratorBlueprint): Promise<OrchestrationPlan>;
  deploy(plan: OrchestrationPlan): Promise<OrchestrationRun>;
  rollback(run: OrchestrationRun): Promise<boolean>;
  validate(blueprint: OrchestratorBlueprint): Promise<TopologyValidationReport>;
}

export interface OrchestrationPlan {
  readonly id: OrchestrationId;
  readonly compiledAt: number;
  readonly graph: GraphDefinition;
  readonly order: ReadonlyArray<OrchestrationId>;
  readonly edges: ReadonlyArray<OrchestrationEdge>;
  readonly metadata: Record<string, unknown>;
}

export interface BlueprintCursor {
  readonly manifestId: OrchestrationId;
  readonly current: OrchestrationId[];
  readonly pending: OrchestrationId[];
  readonly completed: OrchestrationId[];
  readonly failed: OrchestrationId[];
}

export class BlueprintEngine {
  private readonly edgeMap = new Map<OrchestrationId, OrchestrationEdge[]>();
  private readonly nodeMap = new Map<OrchestrationId, OrchestrationNode>();
  private readonly completed = new Set<OrchestrationId>();

  constructor(private readonly resolver = new TopologyResolver({ enforceAcyclic: true, forbidCrossRegionEdges: false, maxOutDegree: 999, maxHopCount: 999 }, {
    id: 'ctx',
    tenantId: 'tenant',
    accountId: 'acct',
    region: 'us-east',
    owner: { tenantId: 'tenant', accountId: 'acct' },
    stamp: 0 as never,
    revision: 1,
    window: { sampleWindowMs: 1000, targetRps: 10, maxBurst: 10 },
  })) {}

  importGraph(graph: GraphDefinition): TopologyValidationReport {
    return this.resolver.apply(graph);
  }

  compile(blueprint: OrchestratorBlueprint): OrchestrationPlan {
    for (const node of blueprint.nodes) this.nodeMap.set(node.id as OrchestrationId, node);
    for (const edge of blueprint.edges) {
      const list = this.edgeMap.get(edge.from as OrchestrationId) ?? [];
      list.push(edge);
      this.edgeMap.set(edge.from as OrchestrationId, list);
    }
    const ordered = this.sortNodes();
    return {
      id: `plan-${blueprint.id}`,
      compiledAt: Date.now(),
      graph: {
        id: blueprint.graph,
        ctx: { id: 0 as never, tenantId: 'tenant', accountId: 'acct', region: 'us-east', owner: { tenantId: 'tenant', accountId: 'acct' }, stamp: 0 as never, revision: 1, window: { sampleWindowMs: 1000, targetRps: 10, maxBurst: 10 } },
        nodes: [],
        edges: [],
        created: Date.now(),
      },
      order: ordered,
      edges: [...blueprint.edges],
      metadata: { source: blueprint.name },
    };
  }

  validate(blueprint: OrchestratorBlueprint): TopologyValidationReport {
    return { graph: blueprint.graph, issues: [], valid: true };
  }

  private sortNodes(): ReadonlyArray<OrchestrationId> {
    const out: OrchestrationId[] = [];
    const visiting = new Set<OrchestrationId>();
    const visited = new Set<OrchestrationId>();

    const visit = (id: OrchestrationId) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) return;
      visiting.add(id);

      for (const edge of this.edgeMap.get(id) ?? []) {
        visit(edge.to);
      }

      visiting.delete(id);
      visited.add(id);
      out.push(id);
    };

    for (const id of this.nodeMap.keys()) visit(id);
    return out;
  }
}

export function buildBlueprint(
  graphId: GraphId,
  prefix = 'nebula',
): OrchestratorBlueprint {
  const nodes: OrchestrationNode[] = [];
  const edges: OrchestrationEdge[] = [];
  for (let i = 0; i < 120; i += 1) {
    const id = `${prefix}-node-${i}` as OrchestrationId;
    const next = `${prefix}-node-${i + 1}` as OrchestrationId;
    nodes.push({
      id,
      kind: ['validate', 'compile', 'deploy', 'observe', 'rollback', 'audit'][i % 6] as StepKind,
      nodeId: `node-${i}` as NodeId,
      dependsOn: i === 0 ? [] : [`${prefix}-node-${i - 1}` as OrchestrationId],
      enabled: true,
      weight: 1 + (i % 7),
      script: `step-${i}`,
    });
    if (i > 0) {
      edges.push({
        id: `${prefix}-edge-${i}` as EdgeId,
        from: `${prefix}-node-${i - 1}` as OrchestrationId,
        to: id,
        condition: `if-weight-${i}`,
      });
    }
  }
  return {
    id: `blueprint-${graphId}-${prefix}` as OrchestrationId,
    name: `${prefix}:${graphId}`,
    graph: graphId,
    nodes,
    edges,
    labels: {
      layer: 'nebula',
      origin: prefix,
    },
  };
}

export function createManifest(graphId: GraphId, owner: string): OrchestrationManifest {
  const blueprint = buildBlueprint(graphId);
  return {
    id: `${graphId}-manifest-${owner}` as OrchestrationId,
    project: owner,
    revision: 1,
    blueprint,
    createdAt: Date.now(),
    owner,
  };
}

export const BlueprintSamples = Array.from({ length: 120 }, (_, i) => buildBlueprint(`graph-${i}` as GraphId, `sample-${i}`));
