import type { RecoverySignal, RecoveryScenario, RecoveryAction, FusionPlan } from '@domain/incident-fusion-models';
import { withBrand } from '@shared/core';
import {
  createScheduleRules,
  buildScenarioSchedule,
  summarizeScheduling,
  type ScenarioSchedule,
  computeScenarioReadiness,
} from '@domain/incident-fusion-models';

export interface PreparedScenario {
  readonly scenario: RecoveryScenario;
  readonly signals: readonly RecoverySignal[];
  readonly actions: readonly RecoveryAction[];
  readonly tenant: string;
}

export interface PlanDraft {
  readonly plan: FusionPlan;
  readonly schedule: ScenarioSchedule;
  readonly summary: {
    readonly readiness: number;
    readonly totalActions: number;
    readonly immediateActions: number;
    readonly automatedActions: number;
  };
}

export const preparePlan = (_tenant: string, context: PreparedScenario): PlanDraft => {
  const schedule = buildScenarioSchedule(context);
  const rules = createScheduleRules(context);
  const readiness = computeScenarioReadiness(context.scenario, context.signals);
  const plan: FusionPlan = {
    planId: withBrand(`plan-${context.scenario.id}`, 'FusionPlanId'),
    scenarioId: context.scenario.id,
    tenant: context.tenant,
    title: `Fusion plan for ${context.scenario.name}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    signals: context.signals,
    actions: context.actions,
    scenarioState: context.scenario.state,
  };

  const scheduleSummary = summarizeScheduling(context.scenario, rules);
  return {
    plan,
    schedule,
    summary: {
      readiness: readiness.value,
      totalActions: context.actions.length,
      immediateActions: scheduleSummary.immediateCount,
      automatedActions: scheduleSummary.autoCount,
    },
  };
};

export const planByScenario = (tenant: string, scenarios: readonly RecoveryScenario[]): readonly PlanDraft[] => {
  const byName = new Map<string, number>();
  return scenarios.map((scenario) => {
    const signals = byName.has(scenario.owner) ? [] : [];
    byName.set(scenario.owner, (byName.get(scenario.owner) ?? 0) + 1);
    const actions = [
      {
        id: withBrand(`auto-${scenario.id}-1`, 'ActionId'),
        tenant,
        scenarioId: scenario.id,
        title: `Verify ${scenario.name}`,
        rationale: 'ensure continuity pre-checks',
        runbook: 'runbook://fusion/verify',
        estimatedMinutes: 15,
        preconditions: ['observe signals'],
        postconditions: ['acknowledge state', 'notify stakeholders'],
        automated: true,
        owner: scenario.owner,
        dependsOn: [],
      },
    ];
    return preparePlan(tenant, {
        scenario,
      signals: [],
      actions,
      tenant,
    });
  });
};

export const rankPlanDrafts = (plans: readonly PlanDraft[]): readonly PlanDraft[] => {
  return [...plans].toSorted((left, right) => {
    if (left.summary.readiness !== right.summary.readiness) {
      return right.summary.readiness - left.summary.readiness;
    }
    if (left.summary.immediateActions !== right.summary.immediateActions) {
      return right.summary.immediateActions - left.summary.immediateActions;
    }
    return right.summary.automatedActions - left.summary.automatedActions;
  });
};
