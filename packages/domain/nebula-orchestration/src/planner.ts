import type {
  OrchestratorBlueprint,
  OrchestrationId,
  OrchestrationEdge,
  OrchestratorService,
  OrchestrationRun,
  OrchestrationPlan,
} from './blueprint';

import { BlueprintEngine, buildBlueprint } from './blueprint';

export interface PlannedStep {
  readonly id: OrchestrationId;
  readonly order: number;
  readonly dependencies: ReadonlyArray<OrchestrationId>;
  readonly weight: number;
}

export interface PlannerReport {
  readonly blueprint: OrchestrationId;
  readonly steps: ReadonlyArray<PlannedStep>;
  readonly depth: number;
  readonly criticalPath: number;
}

export class OrchestrationPlanner {
  private readonly engine: BlueprintEngine;
  private readonly planByBlueprint = new Map<OrchestrationId, PlannerReport>();

  constructor(engine?: BlueprintEngine) {
    this.engine = engine ?? new BlueprintEngine();
  }

  build(blueprint: OrchestratorBlueprint): OrchestrationPlan {
    const plan = this.engine.compile(blueprint);
    const steps: PlannedStep[] = plan.order.map((step, order) => ({
      id: step,
      order,
      dependencies: this.findDependencies(blueprint, step),
      weight: 1 + (order % 10),
    }));

    const report: PlannerReport = {
      blueprint: blueprint.id,
      steps,
      depth: this.computeDepth(blueprint.edges),
      criticalPath: this.computeCriticalPath(steps),
    };
    this.planByBlueprint.set(blueprint.id, report);
    return plan;
  }

  private findDependencies(blueprint: OrchestratorBlueprint, step: OrchestrationId): ReadonlyArray<OrchestrationId> {
    const inDeps: OrchestrationId[] = [];
    for (const edge of blueprint.edges) {
      if (edge.to === step) inDeps.push(edge.from);
    }
    return inDeps;
  }

  private computeDepth(edges: ReadonlyArray<OrchestrationEdge>): number {
    const outgoing = new Map<OrchestrationId, OrchestrationId[]>();
    const incomingCount = new Map<OrchestrationId, number>();

    for (const edge of edges) {
      outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
      incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
      incomingCount.set(edge.from, incomingCount.get(edge.from) ?? 0);
    }

    const q: OrchestrationId[] = [];
    for (const [id, count] of incomingCount.entries()) {
      if (count === 0) q.push(id);
    }

    let depth = 0;
    let current = q;
    while (current.length > 0) {
      depth += 1;
      const next: OrchestrationId[] = [];
      for (const id of current) {
        for (const edge of outgoing.get(id) ?? []) {
          const left = (incomingCount.get(edge) ?? 1) - 1;
          incomingCount.set(edge, left);
          if (left <= 0) next.push(edge);
        }
      }
      current = next;
    }
    return depth;
  }

  private computeCriticalPath(steps: ReadonlyArray<PlannedStep>): number {
    return steps.reduce((acc, step) => acc + step.weight, 0);
  }

  report(id: OrchestrationId): PlannerReport | undefined {
    return this.planByBlueprint.get(id);
  }

  static sample(prefix: string, count: number): OrchestrationPlanner[] {
    const output: OrchestrationPlanner[] = [];
    const planner = new OrchestrationPlanner();
    for (let i = 0; i < count; i++) {
      const blueprint = buildBlueprint(`sample-${i}` as never, `${prefix}-${i}`);
      planner.build(blueprint);
      output.push(planner);
    }
    return output;
  }
}

export class OrchestrationOrchestrator {
  constructor(private readonly service: OrchestratorService, private readonly planner: OrchestrationPlanner) {}

  async provision(blueprint: OrchestratorBlueprint): Promise<OrchestrationRun> {
    const plan = this.planner.build(blueprint);
    return this.service.deploy(plan);
  }

  async runMany(blueprints: ReadonlyArray<OrchestratorBlueprint>): Promise<OrchestrationRun[]> {
    const runs: OrchestrationRun[] = [];
    for (const blueprint of blueprints) {
      runs.push(await this.provision(blueprint));
    }
    return runs;
  }
}

export function planSequence(start: OrchestrationId, steps: number): ReadonlyArray<PlannedStep> {
  return Array.from({ length: steps }, (_, idx) => ({
    id: `${start}-step-${idx}` as OrchestrationId,
    order: idx,
    dependencies: idx > 0 ? [`${start}-step-${idx - 1}` as OrchestrationId] : [],
    weight: (idx % 5) + 1,
  }));
}
