import { buildPlan } from './engine';
import {
  defaultConstraint,
  type SimulationConstraint,
  type SimulationPlanEnvelope,
  type SimulationPlanInput,
  type SimulationWorkspaceSnapshot,
} from './types';
import { type ReadinessPolicy, type RecoveryReadinessPlanDraft, type ReadinessSignal, type ReadinessRunId } from '@domain/recovery-readiness';
import { SimulationWorkspace } from './workspace';

export interface RecoveryReadinessSimulationInput {
  readonly tenant: string;
  readonly draft: RecoveryReadinessPlanDraft;
  readonly graph: SimulationPlanInput['graph'];
  readonly policy: ReadinessPolicy;
  readonly runId: ReadinessRunId;
  readonly signals: readonly ReadinessSignal[];
  readonly constraints?: SimulationConstraint;
}

export interface SimulationCoordinator {
  createPlan(input: RecoveryReadinessSimulationInput): SimulationPlanEnvelope;
  startPlan(input: RecoveryReadinessSimulationInput): SimulationWorkspace;
  describeState(snapshot: SimulationWorkspaceSnapshot): string;
}

export class RecoveryReadinessSimulationCoordinator implements SimulationCoordinator {
  createPlan(input: RecoveryReadinessSimulationInput): SimulationPlanEnvelope {
    const planInput: SimulationPlanInput = {
      tenant: input.tenant,
      runId: input.runId,
      draft: input.draft,
      graph: input.graph,
      policy: input.policy,
      signals: input.signals,
      constraints: input.constraints ?? defaultConstraint(input.draft.targetIds.length),
    };

    const built = buildPlan(planInput);
    if (!built.ok) {
      throw built.error;
    }

    return built.value;
  }

  startPlan(input: RecoveryReadinessSimulationInput): SimulationWorkspace {
    const envelope = this.createPlan(input);
    return new SimulationWorkspace(envelope);
  }

  describeState(snapshot: SimulationWorkspaceSnapshot): string {
    return `${snapshot.runId}:${snapshot.status}:${snapshot.executedWaves}`;
  }
}
