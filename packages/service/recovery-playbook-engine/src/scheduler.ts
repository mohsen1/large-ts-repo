import { fail, ok, type Result } from '@shared/result';
import type {
  RecoveryPlaybook,
  RecoveryStepId,
  RecoveryStep,
} from '@domain/recovery-playbooks';
import type { PlaybookSelectionResult, StageExecution, StageName } from './model';

export interface PlanStage {
  id: StageName;
  stepIds: readonly RecoveryStepId[];
  windowMinutes: number;
  reason: string;
}

export interface PlanSchedule {
  stages: readonly PlanStage[];
  estimatedMinutes: number;
  concurrency: number;
}

export interface StepDependency {
  step: RecoveryStepId;
  dependsOn: RecoveryStepId[];
}

export interface StageGraph {
  byStage: Map<StageName, readonly RecoveryStepId[]>;
  edges: Map<RecoveryStepId, readonly RecoveryStepId[]>;
  order: readonly RecoveryStepId[];
}

const dependsOnEdge = (step: RecoveryStep): StepDependency => ({
  step: step.id as RecoveryStepId,
  dependsOn: step.dependencies.map((dependency) => dependency.dependsOn),
});

const byId = (steps: readonly RecoveryStep[]): Map<RecoveryStepId, RecoveryStep> => {
  const map = new Map<RecoveryStepId, RecoveryStep>();
  for (const step of steps) map.set(step.id as RecoveryStepId, step);
  return map;
};

const buildTopology = (dependencies: readonly StepDependency[]): StageGraph => {
  const byStage = new Map<StageName, readonly RecoveryStepId[]>();
  const edges = new Map<RecoveryStepId, readonly RecoveryStepId[]>();
  for (const item of dependencies) {
    edges.set(item.step, item.dependsOn);
  }
  const order: RecoveryStepId[] = [];
  const inboundCount = new Map<RecoveryStepId, number>();
  const dependents = new Map<RecoveryStepId, Set<RecoveryStepId>>();

  for (const dep of dependencies) {
    inboundCount.set(dep.step, dep.dependsOn.length);
    for (const required of dep.dependsOn) {
      const existing = dependents.get(required) ?? new Set<RecoveryStepId>();
      existing.add(dep.step);
      dependents.set(required, existing);
    }
  }

  const queue: RecoveryStepId[] = [];
  for (const dep of dependencies) {
    if ((inboundCount.get(dep.step) ?? 0) === 0) queue.push(dep.step);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    order.push(current);
    const followers = dependents.get(current) ?? new Set<RecoveryStepId>();
    for (const follower of followers) {
      const count = (inboundCount.get(follower) ?? 0) - 1;
      inboundCount.set(follower, count);
      if (count === 0) queue.push(follower);
    }
  }

  const stageByHour = new Map<string, RecoveryStepId[]>();
  let index = 0;
  for (const id of order) {
    const stage = `bucket-${Math.floor(index / 3)}` as StageName;
    stageByHour.set(stage, [...(stageByHour.get(stage) ?? []), id]);
    index += 1;
  }

  for (const [stage, steps] of stageByHour.entries()) {
    byStage.set(stage as StageName, steps);
  }

  return { byStage, edges, order };
};

export class Scheduler {
  constructor(private readonly concurrencyLimit = 4) {}

  createSchedule(playbook: RecoveryPlaybook, result: PlaybookSelectionResult): Result<PlanSchedule, string> {
    const dependencies = playbook.steps.map(dependsOnEdge);
    const topology = buildTopology(dependencies);

    const stages: PlanStage[] = [];
    for (const [stageId, stepIds] of topology.byStage.entries()) {
      const stageMinutes = stepIds.reduce((acc, stepId) => {
        const step = playbook.steps.find((candidate) => candidate.id === stepId);
        return acc + (step?.durationMinutes ?? 0);
      }, 0);
      stages.push({
        id: stageId as StageName,
        stepIds,
        windowMinutes: Math.max(1, stageMinutes),
        reason: `rank:${result.score.toFixed(2)} buckets:${result.plan.riskBucket}`,
      });
    }

    if (stages.length === 0) return fail('playbook-has-no-stages');

    return ok({
      stages,
      estimatedMinutes: topology.order.length > 0 ? topology.order.length * 6 : result.plan.expectedMinutes,
      concurrency: this.concurrencyLimit,
    });
  }

  buildExecutionTrace(playbook: RecoveryPlaybook): StageExecution[] {
    const dependencies = playbook.steps.map(dependsOnEdge);
    const topology = buildTopology(dependencies);
    return topology.order
      .map((stepId) => ({
        stage: `runtime-${topology.order.indexOf(stepId)}` as StageName,
        failedSteps: [],
        completedSteps: [stepId],
      }));
  }

  canRunInParallel(stepA: RecoveryStep, stepB: RecoveryStep): boolean {
    const aId = stepA.id as RecoveryStepId;
    const bId = stepB.id as RecoveryStepId;
    if (stepA.type === 'human-gate' || stepB.type === 'human-gate') return false;

    const blocksA = stepA.dependencies.some((dependency) => dependency.dependsOn === bId);
    const blocksB = stepB.dependencies.some((dependency) => dependency.dependsOn === aId);
    return !(blocksA || blocksB);
  }
}
