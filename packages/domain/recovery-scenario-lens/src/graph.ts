import type { Brand } from '@shared/type-level';
import {
  CommandId,
  PlanCandidate,
  ScenarioCommand,
  ScenarioId,
  ScenarioLink,
  ScenarioConstraint,
  ScenarioBlueprint,
  asPlanCandidateId,
} from './types';

export type CommandNodeId = Brand<string, 'CommandNodeId'>;

export interface LensNode {
  readonly id: CommandId;
  readonly command: ScenarioCommand;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LensEdge {
  readonly from: CommandId;
  readonly to: CommandId;
  readonly coupling: number;
  readonly reason: string;
}

export interface LensGraph {
  readonly nodes: readonly LensNode[];
  readonly edges: readonly LensEdge[];
}

interface MutableGraphNode {
  id: CommandId;
  command: ScenarioCommand;
  metadata: Record<string, unknown>;
  inDegree: number;
  outDegree: number;
  dependents: Set<CommandId>;
}

export class ScenarioDependencyGraph {
  private readonly nodeMap = new Map<CommandId, MutableGraphNode>();
  private readonly adjacency = new Map<CommandId, Set<CommandId>>();
  private readonly blueprintId: ScenarioId;

  constructor(
    commands: readonly ScenarioCommand[],
    links: readonly ScenarioLink[],
    blueprintId: ScenarioId,
  ) {
    this.blueprintId = blueprintId;
    for (const command of commands) {
      this.nodeMap.set(command.commandId, {
        id: command.commandId,
        command,
        metadata: { commandName: command.commandName },
        inDegree: 0,
        outDegree: 0,
        dependents: new Set(),
      });
      this.adjacency.set(command.commandId, new Set());
    }

    for (const link of links) {
      const from = this.nodeMap.get(link.from);
      const to = this.nodeMap.get(link.to);
      if (!from || !to) {
        continue;
      }
      this.adjacency.get(link.from)?.add(link.to);
      from.outDegree += 1;
      to.inDegree += 1;
      to.dependents.add(link.from);
    }
  }

  get nodes(): readonly LensNode[] {
    return [...this.nodeMap.values()].map((node) => ({
      id: node.id,
      command: node.command,
      metadata: node.metadata,
    }));
  }

  get edges(): readonly LensEdge[] {
    const allEdges: LensEdge[] = [];
    for (const [from, targets] of this.adjacency.entries()) {
      const fromCommand = this.nodeMap.get(from)?.command;
      if (!fromCommand) {
        continue;
      }
      for (const to of targets) {
        const link = this.lookupCoupling(from, to);
        allEdges.push({
          from,
          to,
          coupling: link,
          reason: `dependency:${fromCommand.targetService}->${this.nodeMap.get(to)?.command.targetService ?? 'unknown'}`,
        });
      }
    }
    return allEdges;
  }

  private lookupCoupling(from: CommandId, to: CommandId): number {
    const source = this.nodeMap.get(from);
    const sink = this.nodeMap.get(to);
    if (!source || !sink) {
      return 0;
    }
    return Math.abs(source.command.blastRadius - sink.command.blastRadius);
  }

  asReadonlyGraph(): LensGraph {
    return { nodes: this.nodes, edges: this.edges };
  }

  hasCycle(): boolean {
    return this.topologicalOrder().cyclic;
  }

  topologicalOrder(): { ordered: readonly CommandId[]; cyclic: boolean } {
    const inDegree = new Map<CommandId, number>();
    for (const [id, node] of this.nodeMap.entries()) {
      inDegree.set(id, node.inDegree);
    }

    const queue: CommandId[] = [];
    for (const [id, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const ordered: CommandId[] = [];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) {
        break;
      }
      ordered.push(id);
      for (const next of this.adjacency.get(id) ?? []) {
        const nextDegree = inDegree.get(next) ?? 0;
        const decremented = nextDegree - 1;
        inDegree.set(next, decremented);
        if (decremented === 0) {
          queue.push(next);
        }
      }
    }

    return { ordered, cyclic: ordered.length !== this.nodeMap.size };
  }

  criticalPath(): readonly CommandId[] {
    const { ordered, cyclic } = this.topologicalOrder();
    if (cyclic) {
      return ordered;
    }

    const pathCost = new Map<CommandId, number>();
    const predecessor = new Map<CommandId, CommandId | undefined>();

    for (const commandId of ordered) {
      const command = this.nodeMap.get(commandId)?.command;
      if (!command) {
        continue;
      }
      const candidates = [...(this.nodeMap.get(commandId)?.dependents ?? [])];
      let bestCost = Number(command.estimatedDurationMs);
      let bestPredecessor: CommandId | undefined;

      for (const dependencyId of candidates) {
        const candidateCost = (pathCost.get(dependencyId) ?? 0) + Number(command.estimatedDurationMs);
        if (candidateCost > bestCost) {
          bestCost = candidateCost;
          bestPredecessor = dependencyId;
        }
      }

      pathCost.set(commandId, bestCost);
      predecessor.set(commandId, bestPredecessor);
    }

    let terminal: CommandId | undefined;
    let terminalCost = -1;
    for (const [id, cost] of pathCost.entries()) {
      if (cost > terminalCost) {
        terminalCost = cost;
        terminal = id;
      }
    }

    if (!terminal) {
      return [];
    }

    const result: CommandId[] = [terminal];
    let current = terminal;
    while (predecessor.has(current)) {
      const prev = predecessor.get(current);
      if (!prev) {
        break;
      }
      result.push(prev);
      current = prev;
    }
    return result.reverse();
  }

  bucketByLayer(): readonly CommandId[][] {
    const remaining = new Map<CommandId, number>();
    for (const [id, node] of this.nodeMap.entries()) {
      remaining.set(id, node.inDegree);
    }

    const layers: CommandId[][] = [];
    while (true) {
      const layer = [...remaining.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
      if (layer.length === 0) {
        break;
      }
      layers.push(layer);
      for (const node of layer) {
        remaining.delete(node);
        for (const child of this.adjacency.get(node) ?? []) {
          const childDegree = remaining.get(child);
          if (childDegree !== undefined) {
            remaining.set(child, childDegree - 1);
          }
        }
      }
    }
    return layers;
  }

  toPlanCandidate(version: number, windowMinutes: number): PlanCandidate {
    const ordered = this.topologicalOrder().ordered;
    const windows = this.bucketByLayer().map((commandIds, index) => ({
      commandIds,
      startAt: this.isoAtWindowStart(index, windowMinutes),
      endAt: this.isoAtWindowEnd(index, windowMinutes),
      concurrency: commandIds.length,
    }));

    const scores = ordered.map((id) => this.nodeMap.get(id)?.command.resourceSpendUnits ?? 0);
    const score = ordered.length > 0 ? scores.reduce((acc, value) => acc + value, 0) / ordered.length : 0;
    const risk = ordered.reduce((acc, id) => acc + (this.nodeMap.get(id)?.command.blastRadius ?? 0), 0);

    return {
      candidateId: asPlanCandidateId(`candidate-${version}`),
      blueprintId: this.blueprintId,
      orderedCommandIds: ordered,
      windows,
      score,
      risk,
      resourceUse: ordered.reduce((acc, id) => acc + (this.nodeMap.get(id)?.command.resourceSpendUnits ?? 0), 0),
    };
  }

  private isoAtWindowStart(layerIndex: number, windowMinutes: number): string {
    const now = Date.now() + layerIndex * windowMinutes * 60 * 1000;
    return new Date(now).toISOString();
  }

  private isoAtWindowEnd(layerIndex: number, windowMinutes: number): string {
    const now = Date.now() + (layerIndex + 1) * windowMinutes * 60 * 1000;
    return new Date(now).toISOString();
  }
}

export const mergeConstraintSets = (left: readonly ScenarioConstraint[], right: readonly ScenarioConstraint[]): ScenarioConstraint[] => {
  const merged = new Map<string, ScenarioConstraint>();
  for (const constraint of [...left, ...right]) {
    merged.set(constraint.constraintId, constraint);
  }
  return [...merged.values()];
};

export const buildGraphFromBlueprint = (blueprint: ScenarioBlueprint): ScenarioDependencyGraph =>
  new ScenarioDependencyGraph(blueprint.commands, blueprint.links, blueprint.scenarioId);
