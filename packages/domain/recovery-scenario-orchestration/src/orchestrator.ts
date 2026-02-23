import type {
  RecoveryPlan,
  RecoverySignal,
  ScenarioIntent,
  OrchestratorContext,
  ScenarioForecast,
  RecoveryRun,
  RecoveryBlueprint,
  RecoveryState,
  IncidentEnvelope,
  ConstraintSnapshot,
} from './types';
import { buildPlanStub, buildStrategy, summarizeStrategy } from './strategy';
import { constraintsToSnapshots } from './constraints';
import { calculateConfidence } from './adapters';

export interface OrchestratorSnapshot {
  readonly context: OrchestratorContext;
  readonly plan: RecoveryPlan;
  readonly runs: readonly RecoveryRun[];
  readonly forecast: ScenarioForecast;
  readonly intent: ScenarioIntent;
}

export interface OrchestratorInput {
  readonly intent: ScenarioIntent;
  readonly incident: IncidentEnvelope;
  readonly signals: readonly RecoverySignal[];
  readonly context: OrchestratorContext;
  readonly blueprint: RecoveryBlueprint;
}

const stamp = (): string => new Date().toISOString();

export class RecoveryScenarioOrchestrator {
  createBlueprint(context: OrchestratorContext, intent: ScenarioIntent): RecoveryPlan {
    return buildPlanStub(context.tenantId, `${context.tenantId}:incident`, intent.scenarioId, 2);
  }

  plan(input: OrchestratorInput, actorId: string): OrchestratorSnapshot {
    const basePlan = buildPlanStub(input.context.tenantId, `${input.incident.id}`, input.intent.scenarioId, input.blueprint.actions.length);
    const snapshots = constraintsToSnapshots(input.blueprint, input.signals).filter(
      (snapshot: ConstraintSnapshot) => snapshot.constraint.key !== '',
    );
    const strategy = buildStrategy(
      {
        plan: basePlan,
        signals: input.signals,
      },
      snapshots,
    );

    const plan: RecoveryPlan = {
      ...strategy.plan,
      state: strategy.readyToRun ? ('running' as RecoveryState) : ('planned' as RecoveryState),
      tags: [actorId, ...input.context.tags],
      updatedAt: stamp(),
    };

    const summary = summarizeStrategy(strategy);
    const forecast: ScenarioForecast = {
      planId: plan.id,
      estimatedStartAt: stamp(),
      estimatedFinishAt: new Date(Date.now() + summary.runs.length * 3 * 60_000).toISOString(),
      criticalPathMinutes: Math.max(1, summary.runs.length * 4),
      successProbability: calculateConfidence(snapshots),
    };

    return {
      context: input.context,
      plan,
      runs: summary.runs,
      forecast,
      intent: input.intent,
    };
  }
}
