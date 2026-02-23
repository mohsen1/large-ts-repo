import { RecoveryScenarioPlanner } from './planner';
import { createDefaultObserverBus, InMemoryScenarioObserverBus } from './observers';
import type { ServiceInput, ServiceEvent } from './types';
import type { RecoverySignal, ConstraintSnapshot } from '@domain/recovery-scenario-orchestration';
import { calculateConfidence } from '@domain/recovery-scenario-orchestration';

export interface EngineInput {
  readonly input: ServiceInput;
  readonly signals: readonly RecoverySignal[];
}

export interface ScenarioExecutionResult {
  readonly scenarioId: string;
  readonly actor: string;
  readonly confidence: number;
  readonly canRun: boolean;
  readonly listenersNotified: number;
}

export class RecoveryScenarioEngine {
  private readonly planner: RecoveryScenarioPlanner;
  private readonly bus: InMemoryScenarioObserverBus;

  constructor(private readonly actor: string) {
    this.planner = new RecoveryScenarioPlanner(actor);
    this.bus = createDefaultObserverBus();
  }

  subscribe(scope: string, handler: (event: ServiceEvent) => void): () => void {
    return this.bus.subscribe(scope, handler);
  }

  private emit(event: ServiceEvent): void {
    this.bus.publishToAll(event);
  }

  run(input: EngineInput, constraints: readonly ConstraintSnapshot[]): ScenarioExecutionResult {
    const draft = this.planner.draft({ ...input.input, actorId: this.actor, signals: input.signals });
    const validated = this.planner.validate(draft, constraints);

    this.emit({
      type: 'plan_created',
      correlationId: draft.forecast.planId,
      timestamp: new Date().toISOString(),
      payload: {
        planId: draft.plan.id,
        incidentId: draft.intent.tenantId,
        canRun: validated.canRun,
        confidence: draft.forecast.successProbability,
      },
    });

    return {
      scenarioId: draft.intent.scenarioId,
      actor: this.actor,
      confidence: calculateConfidence(constraints),
      canRun: validated.canRun,
      listenersNotified: 1,
    };
  }

  getState() {
    return this.planner.hydrate();
  }
}
