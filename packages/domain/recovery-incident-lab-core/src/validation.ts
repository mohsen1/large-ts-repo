import type {
  IncidentLabScenario,
  IncidentLabPlan,
  IncidentLabRun,
  IncidentLabSignal,
} from './types';

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

const duplicateCheck = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      dup.add(value);
    } else {
      seen.add(value);
    }
  }
  return [...dup].map((item) => `duplicate:${item}`);
};

export const validateScenario = (scenario: IncidentLabScenario): ValidationResult => {
  if (!scenario.id) {
    return { ok: false, issues: ['scenario id missing'] };
  }
  if (!scenario.steps || scenario.steps.length === 0) {
    return { ok: false, issues: ['scenario has no steps'] };
  }

  const known = new Set(scenario.steps.map((step) => String(step.id)));
  const missing = scenario.steps.flatMap((step) => {
    return step.dependencies.filter((dependency) => !known.has(String(dependency))).map((dependency) => `missing:${String(dependency)}`);
  });

  const issues = [...missing, ...duplicateCheck(scenario.steps.map((step) => String(step.id)))];
  return { ok: issues.length === 0, issues };
};

export const validatePlan = (plan: IncidentLabPlan): ValidationResult => {
  if (!plan.scenarioId) {
    return { ok: false, issues: ['plan scenario missing'] };
  }
  if (plan.queue.length === 0) {
    return { ok: false, issues: ['plan queue empty'] };
  }
  const issues = duplicateCheck(plan.queue.map((step) => String(step)));
  return { ok: issues.length === 0, issues };
};

export const validateRun = (run: IncidentLabRun): ValidationResult => {
  if (!run.runId) {
    return { ok: false, issues: ['run id missing'] };
  }
  const hasIncomplete = run.results.some((result) => !result.startAt || !result.finishAt);
  if (run.results.length === 0 || hasIncomplete) {
    return { ok: false, issues: ['run results incomplete'] };
  }
  return { ok: true, issues: [] };
};

export const validateSignal = (signal: IncidentLabSignal): ValidationResult => {
  if (signal.value < 0) {
    return { ok: false, issues: ['negative value'] };
  }
  if (!signal.kind || !signal.node) {
    return { ok: false, issues: ['signal malformed'] };
  }
  return { ok: true, issues: [] };
};
