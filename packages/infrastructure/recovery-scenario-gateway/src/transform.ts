import type {
  RecoveryBlueprint,
  RecoveryPlan,
  RecoveryRun,
  ScenarioAction,
  RecoverySignal,
} from '@domain/recovery-scenario-orchestration';
import { scoreConstraint } from '@domain/recovery-scenario-orchestration';
import type { ConstraintSnapshot } from '@domain/recovery-scenario-orchestration';

export interface RuntimeEnvelopeDTO {
  readonly plan: RecoveryPlan;
  readonly runs: readonly RecoveryRun[];
  readonly actions: readonly ScenarioAction[];
  readonly signals: readonly RecoverySignal[];
}

export interface ActionAuditRecord {
  readonly actionId: string;
  readonly actionCode: string;
  readonly actionTitle: string;
  readonly owner: string;
}

export interface BlueprintDTO {
  readonly scenarioId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly constraints: readonly { key: string; operator: string; threshold: number }[];
  readonly actions: readonly ActionAuditRecord[];
}

export const normalizePlanDto = (plan: RecoveryPlan): RuntimeEnvelopeDTO => ({
  plan,
  runs: [],
  actions: [...plan.actions],
  signals: [],
});

export const blueprintToAudit = (blueprint: RecoveryBlueprint): ActionAuditRecord[] =>
  blueprint.actions.map((action) => ({
    actionId: String(action.id),
    actionCode: action.code,
    actionTitle: action.title,
    owner: action.owner,
  }));

export const blueprintToDTO = (blueprint: RecoveryBlueprint): BlueprintDTO => ({
  scenarioId: String(blueprint.scenarioId),
  tenantId: String(blueprint.tenantId),
  name: blueprint.name,
  description: blueprint.description,
  constraints: blueprint.constraints.map((constraint) => ({
    key: constraint.key,
    operator: constraint.operator,
    threshold: constraint.threshold,
  })),
  actions: blueprintToAudit(blueprint),
});

export const constraintsToSnapshots = (
  blueprint: RecoveryBlueprint,
  signals: readonly RecoverySignal[],
): readonly ConstraintSnapshot[] =>
  blueprint.constraints.map((constraint) =>
    scoreConstraint(constraint, {
      signals: signals.map((signal) => ({ metric: signal.metric, value: signal.value, observedAt: signal.observedAt })),
      timestamp: new Date().toISOString(),
    }),
  );
