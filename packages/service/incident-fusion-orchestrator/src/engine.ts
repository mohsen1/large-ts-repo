import { ok, err, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type {
  RecoverySignal,
  RecoveryScenario,
  RecoveryAction,
  FusionSimulation,
  FusionPlan,
  FusionRunId,
  ScenarioId,
} from '@domain/incident-fusion-models';
import {
  computeScenarioReadiness,
  detectHotSignals,
  buildHealthSeries,
  buildIncidentHealthReport,
  riskIndex,
  createScheduleRules,
  buildScenarioSchedule,
  summarizeScheduling,
  validateRules,
  type ScenarioSchedule,
  type ActionScheduleRule,
} from '@domain/incident-fusion-models';
import type { IncidentFusionStore, QueryFilter } from '@data/incident-fusion-store';
import { createFusionRepository } from '@data/incident-fusion-store';
import { selectByWindow, type TickWindow } from './scheduler';

export interface FusionPlanContext {
  readonly tenant: string;
  readonly scenario: RecoveryScenario;
  readonly signals: readonly RecoverySignal[];
  readonly actions: readonly RecoveryAction[];
}

export interface FusionRunResult {
  readonly simulation: FusionSimulation;
  readonly plan: FusionPlan;
  readonly schedule: ScenarioSchedule;
  readonly score: number;
  readonly warnings: readonly string[];
}

export interface RuntimePlan {
  readonly runId: FusionRunId;
  readonly tenant: string;
  readonly scenarioId: ScenarioId;
  readonly startedAt: string;
  readonly steps: readonly {
    readonly actionId: RecoveryAction['id'];
    readonly startedAt: string;
    readonly endedAt?: string;
    readonly success: boolean;
  }[];
}

export interface EngineState {
  readonly tenant: string;
  readonly scenarioCount: number;
  readonly queuedSignals: number;
  readonly queuedActions: number;
}

const isoNow = () => new Date().toISOString();
const normalizeScore = (value: number): number => Math.max(0, Math.min(1, value));

export const buildPlan = (
  context: FusionPlanContext,
): { readonly plan: FusionPlan; readonly schedule: ScenarioSchedule } => {
  const rules = createScheduleRules(context);
  const schedule = buildScenarioSchedule(context);

  const plan: FusionPlan = {
    planId: withBrand(`plan-${context.scenario.id}`, 'FusionPlanId'),
    scenarioId: context.scenario.id,
    tenant: context.tenant,
    title: `Fusion plan for ${context.scenario.name}`,
    createdAt: isoNow(),
    updatedAt: isoNow(),
    signals: context.signals,
    actions: context.actions,
    scenarioState: context.scenario.state,
  };

  const readiness = computeScenarioReadiness(context.scenario, context.signals);
  const scheduleSummary = summarizeScheduling(context.scenario, rules);
  void readiness.value;
  void scheduleSummary.totalRules;

  return { plan, schedule };
};

export const scorePlan = (plan: FusionPlan): number => {
  const signalCount = plan.signals.length;
  const actionCount = plan.actions.length;
  const signalWeight = signalCount > 0 ? 1 / (1 + signalCount / 5) : 0;
  const actionWeight = Math.max(0.1, 1 - Math.min(1, actionCount / 12));
  return normalizeScore(signalWeight * 0.45 + actionWeight * 0.55);
};

export const runOnce = async (context: FusionPlanContext): Promise<Result<FusionRunResult, string>> => {
  if (context.signals.length === 0) {
    return err('No signals available for fusion plan');
  }

  const { plan, schedule } = buildPlan(context);
  const rules = createScheduleRules(context);
  const warnings = validateRules(rules);
  const summary = summarizeScheduling(context.scenario, rules);

  const simulation: FusionSimulation = {
    runId: withBrand(`run-${context.scenario.id}-${Date.now()}`, 'FusionRunId'),
    tenant: context.tenant,
    scenarioId: context.scenario.id,
    steps: rules.map((rule: ActionScheduleRule, order: number) => ({
      order,
      actionId: rule.actionId,
      startedAt: isoNow(),
      endedAt: isoNow(),
      success: true,
      details: {
        ruleWindow: rule.window,
        executionMode: rule.executionMode,
        scenarioId: context.scenario.id,
      },
    })),
    startedAt: isoNow(),
    endedAt: isoNow(),
    score: scorePlan(plan),
    notes: warnings.length === 0 ? `ready:${summary.totalRules}` : `warnings:${warnings.length}`,
  };

  const runtimePlan: RuntimePlan = {
    runId: simulation.runId,
    tenant: context.tenant,
    scenarioId: context.scenario.id,
    startedAt: isoNow(),
    steps: simulation.steps.map((step) => ({
      actionId: step.actionId,
      startedAt: step.startedAt ?? isoNow(),
      endedAt: step.endedAt,
      success: step.success ?? true,
    })),
  };

  void runtimePlan;

  return ok({
    simulation,
    plan,
    schedule,
    score: simulation.score,
    warnings,
  });
};

export const runInWindow = async (
  context: FusionPlanContext,
  window: TickWindow,
): Promise<FusionRunResult | null> => {
  const selected = selectByWindow(context.signals, window);
  if (selected.length === 0) return null;

  const scenarioContext: FusionPlanContext = {
    tenant: context.tenant,
    scenario: context.scenario,
    signals: selected,
    actions: context.actions,
  };
  const result = await runOnce(scenarioContext);
  return result.ok ? result.value : null;
};

export const runFleet = async (
  repository: IncidentFusionStore,
  tenant: string,
): Promise<{ readonly state: EngineState; readonly healthScore: number }> => {
  const signals = await repository.listSignals({ tenant });
  const scenarios = await repository.listScenarios({ tenant });
  const actions = await repository.listActions({ tenant });
  const risk = riskIndex(scenarios, signals);

  let planCount = 0;
  let actionCount = 0;
  for (const scenario of scenarios) {
    const scenarioSignals = signals.filter((signal) => signal.tenant === tenant);
    const scenarioActions = actions.filter((action) => action.scenarioId === scenario.id && action.tenant === tenant);
    const context: FusionPlanContext = {
      tenant,
      scenario,
      signals: scenarioSignals,
      actions: scenarioActions,
    };
    const run = await runOnce(context);
    if (run.ok) {
      planCount += 1;
      actionCount += scenarioActions.length;
      await repository.savePlan(tenant, run.value.plan);
      await repository.saveSimulation(tenant, run.value.simulation);
    }
  }

  return {
    state: {
      tenant,
      scenarioCount: scenarios.length,
      queuedSignals: signals.length,
      queuedActions: actionCount,
    },
    healthScore:
      buildIncidentHealthReport(tenant, scenarios, signals, actions).riskSignal +
      risk +
      planCount / Math.max(1, scenarios.length),
  };
};

export const startEngine = async (
  tenant: string,
  repository = createFusionRepository({ tenant }),
): Promise<Result<EngineState, string>> => {
  const filter: QueryFilter = { tenant };
  const scenarios = await repository.listScenarios(filter);
  const signals = await repository.listSignals(filter);

  if (scenarios.length === 0 || signals.length === 0) {
    return err(`No data for tenant ${tenant}`);
  }

  const health = buildHealthSeries(scenarios[0], signals);
  if (health.length === 0) {
    return err(`No health observations for tenant ${tenant}`);
  }

  await runFleet(repository, tenant);
  return ok({
    tenant,
    scenarioCount: scenarios.length,
    queuedSignals: signals.length,
    queuedActions: 0,
  });
};

export const computeReadiness = async (tenant: string): Promise<{ readonly tenant: string; readonly readiness: number }> => {
  const repository = createFusionRepository({ tenant });
  const scenarios = await repository.listScenarios({ tenant });
  const signals = await repository.listSignals({ tenant });
  if (scenarios.length === 0) {
    return { tenant, readiness: 0 };
  }

  const readiness = scenarios.map((scenario) => computeScenarioReadiness(scenario, signals));
  const mean = readiness.reduce((sum, item) => sum + item.value, 0) / readiness.length;
  const hotSignals = detectHotSignals(
    signals.map((signal) => ({
      tenant,
      data: signal,
      recordedAt: isoNow(),
    })),
    0.85,
  );
  return {
    tenant,
    readiness: normalizeScore(mean - Math.min(0.2, hotSignals.length * 0.02)),
  };
};
