import { normalizeSecondsLimit, parseISODate } from './utils';
import type {
  DrillConstraint,
  DrillPlanEnvelope,
  DrillScenario,
  DrillStatus,
  DrillTemplate,
  DrillRunContext,
  DrillWindow,
} from './types';

interface ConstraintEval {
  code: string;
  satisfied: boolean;
  details: string;
}

interface ScheduledScenario {
  scenarioId: string;
  scheduledAt: string;
  slotSeconds: number;
  dependencies: readonly string[];
}

export interface DrillAgenda {
  runId: string;
  timeline: readonly ScheduledScenario[];
  totalDurationSeconds: number;
  expectedConcurrency: number;
  checks: readonly DrillPolicyGate[];
}

export interface DrillPolicyGate {
  code: string;
  passed: boolean;
  details: string;
}

const safeDuration = (value: number): number => (Number.isFinite(value) && value > 0 ? Math.ceil(value) : 1);

const clampWindow = (window: DrillWindow, maxSeconds: number): DrillWindow => ({
  ...window,
  endAt: new Date(Math.min(parseISODate(window.endAt), parseISODate(window.startAt) + maxSeconds * 1000)).toISOString(),
});

const toIso = (value: number): string => new Date(value).toISOString();

const evaluateConstraint = (value: number, constraint: DrillConstraint): ConstraintEval => {
  const target = constraint.thresholdPct;
  const checks = {
    lt: value < target,
    lte: value <= target,
    gt: value > target,
    gte: value >= target,
    eq: value === target,
    range: value >= 0 && value <= target,
  };
  return {
    code: constraint.code,
    satisfied: checks[constraint.operator],
    details: `${constraint.code} ${constraint.operator} ${target} vs ${value}`,
  };
};

export const resolveWindow = (window: DrillWindow, extensionMinutes = 30): DrillWindow => {
  const resolved = clampWindow(window, normalizeSecondsLimit(extensionMinutes, 30) * 60);
  return {
    startAt: toIso(parseISODate(window.startAt)),
    endAt: resolved.endAt,
    timezone: window.timezone,
  };
};

export const orderScenarios = (scenarios: readonly DrillScenario[]): readonly DrillScenario[] => {
  return [...scenarios]
    .map((scenario) => ({
      scenario,
      riskWeight:
        scenario.recoveryImpactScore + scenario.prerequisites.length * 3 + (scenario.steps.length - 1),
    }))
    .sort((a, b) => b.riskWeight - a.riskWeight)
    .map((item) => item.scenario);
};

export const estimateScenarioSlot = (scenario: DrillScenario): number =>
  safeDuration(
    scenario.steps.reduce((sum, step) => sum + step.expectedSeconds, 0) +
      scenario.prerequisites.length * 60 +
      Math.max(0, scenario.owners.length - 1) * 90,
  );

export const buildAgenda = (template: DrillTemplate, context: DrillRunContext): DrillAgenda => {
  const orderedScenarios = orderScenarios(template.scenarios);
  const cursorStart = parseISODate(context.runAt);
  const timeline = orderedScenarios.map((scenario, index) => {
    const slotSeconds = estimateScenarioSlot(scenario);
    const scheduledAt = toIso(cursorStart + index * 1000 * slotSeconds);
    return {
      scenarioId: scenario.id,
      scheduledAt,
      slotSeconds,
      dependencies: [...scenario.prerequisites],
    } as const;
  });

  const totalDurationSeconds = timeline.reduce((total, item) => total + item.slotSeconds, 0);
  const expectedConcurrency = Math.max(1, Math.ceil(template.scenarios.length / 2));

  const policyChecks = orderedScenarios
    .flatMap((scenario) => scenario.steps)
    .flatMap((step) => step.constraints)
    .map((constraint) => {
      const observed = Math.min(100, Math.max(0, 100 - constraint.thresholdPct));
      return evaluateConstraint(observed, constraint);
    });

  const checks: readonly DrillPolicyGate[] = policyChecks
    .map((entry) => ({
      code: entry.code,
      passed: entry.satisfied,
      details: entry.details,
    }));

  return {
    runId: context.runId,
    timeline,
    totalDurationSeconds: safeDuration(totalDurationSeconds),
    expectedConcurrency,
    checks,
  };
};

export const toEnvelope = (agenda: DrillAgenda, source: string): DrillPlanEnvelope<string> => ({
  source,
  sequence: agenda.timeline.map((item) => item.scenarioId),
  issuedAt: new Date().toISOString(),
  checks: agenda.checks,
});

export const isTerminalStatus = (status: DrillStatus): boolean =>
  status === 'succeeded' || status === 'failed' || status === 'cancelled';

export const estimateLoad = (template: DrillTemplate): number =>
  template.scenarios.reduce((acc, scenario) => acc + scenario.steps.length * scenario.recoveryImpactScore, 0);
