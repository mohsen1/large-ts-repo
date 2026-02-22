import type { IncidentContext, RecoveryScenario, ScenarioDecision, ScenarioEnvelope, RuntimeMetrics } from './types';
import { createPlannedRun, evaluateScenario, buildPlannerExecutionEnvelope as planEnvelope } from './planner';

export interface ScenarioRunbookState {
  stepIndex: number;
  completed: readonly string[];
  elapsedMinutes: number;
  failed: readonly string[];
}

export const initialState = (): ScenarioRunbookState => ({
  stepIndex: 0,
  completed: [],
  elapsedMinutes: 0,
  failed: [],
});

const maxRetriesBySeverity: Record<string, number> = {
  critical: 2,
  high: 1,
  medium: 1,
  low: 0,
  info: 0,
};

const defaultConfidence = {
  low: 0.33,
  medium: 0.55,
  high: 0.73,
  critical: 0.9,
};

export const classifyDecision = (decision: ScenarioDecision): 'execute' | 'defer' | 'discard' => {
  if (decision.confidence >= 75) return 'execute';
  if (decision.confidence >= 45) return 'defer';
  return 'discard';
};

export const canRetryAction = (actionCode: string, context: IncidentContext): boolean => {
  const severity = context.rawMetadata.severity as string;
  const retries = Number(context.rawMetadata.retryBudget ?? 0);
  const maxRetries = maxRetriesBySeverity[severity] ?? 1;
  return retries < maxRetries && actionCode.length > 0;
};

export const stepThrough = (
  state: ScenarioRunbookState,
  scenario: RecoveryScenario,
  context: IncidentContext,
): ScenarioRunbookState => {
  const next = createPlannedRun(scenario, context, evaluateScenario(scenario, context));
  const queue = next.actionCodes;
  const action = queue[state.stepIndex];
  if (!action) {
    return { ...state, elapsedMinutes: state.elapsedMinutes + 1 };
  }

  if (canRetryAction(action, context)) {
    return {
      stepIndex: state.stepIndex + 1,
      completed: [...state.completed, action],
      elapsedMinutes: state.elapsedMinutes + next.estimatedMinutes,
      failed: state.failed,
    };
  }

  return {
    stepIndex: state.stepIndex + 1,
    completed: state.completed,
    elapsedMinutes: state.elapsedMinutes + 1,
    failed: [...state.failed, action],
  };
};

export const buildExecutionEnvelope = (scenario: RecoveryScenario, context: IncidentContext): ScenarioEnvelope => {
  const envelope = planEnvelope(scenario, context);
  const maybeDecision = classifyDecision(envelope.decision);
  const confidenceBySeverity = defaultConfidence[context.rawMetadata.severity as keyof typeof defaultConfidence] ?? 0.5;

  return {
    ...envelope,
    scenario: {
      ...scenario,
      state: maybeDecision === 'execute' ? 'active' : maybeDecision === 'defer' ? 'triage' : scenario.state,
      updatedAt: new Date().toISOString(),
    },
    metrics: enrichMetrics(envelope.metrics, confidenceBySeverity),
  };
};

export const enrichMetrics = (metrics: RuntimeMetrics, confidence: number): RuntimeMetrics => ({
  ...metrics,
  meanSignalValue: metrics.meanSignalValue * (1 - confidence),
  maxSignalValue: metrics.maxSignalValue * confidence,
  matchedSignals: Math.max(1, Math.round(metrics.matchedSignals * (1 + confidence))),
});
