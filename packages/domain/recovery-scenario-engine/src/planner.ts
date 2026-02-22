import { normalizeRuntimeState } from './schema';
import type {
  IncidentContext,
  PlannedRun,
  RecoveryScenario,
  RuntimeMetrics,
  ScenarioAction,
  ScenarioDecision,
} from './types';

const actionWeight = (action: ScenarioAction): number => {
  const tagWeight = action.tags.length;
  const approvalWeight = action.requiredApprovals * 4;
  return Math.max(1, action.estimatedMinutes) + Math.max(0, tagWeight) + approvalWeight;
};

const computeMetrics = (context: IncidentContext): RuntimeMetrics => {
  const values = context.signals.map((signal) => signal.value);
  const matchedSignals = values.length;
  const meanSignalValue = values.length
    ? values.reduce((acc, value) => acc + value, 0) / values.length
    : 0;
  const maxSignalValue = values.length ? Math.max(...values) : 0;
  const uniqueDimensions = new Set(context.signals.flatMap((signal) => Object.keys(signal.dimension))).size;

  const starts = context.signals.map((signal) => Date.parse(signal.observedAt)).filter((v) => Number.isFinite(v));
  const windowStart = starts.length ? new Date(Math.min(...starts)).toISOString() : context.detectedAt;
  const windowEnd = starts.length ? new Date(Math.max(...starts)).toISOString() : context.detectedAt;

  return {
    windowStart,
    windowEnd,
    matchedSignals,
    meanSignalValue,
    maxSignalValue,
    uniqueDimensions,
  };
};

export const evaluateScenario = (scenario: RecoveryScenario, context: IncidentContext): ScenarioDecision => {
  const normalizedSeverity = normalizeRuntimeState(scenario.state) === 'active' ? 'high' : 'medium';
  const rationale: string[] = [];
  const ordered = [...scenario.actions].sort((a, b) => actionWeight(a) - actionWeight(b));
  let confidence = 0;

  for (const action of ordered) {
    if (scenario.tags.includes('manual-only') && action.requiredApprovals === 0) {
      rationale.push(`Action ${action.code} promoted for zero-approval path`);
      confidence += 20;
      continue;
    }
    if (action.tags.includes('rollback')) {
      rationale.push(`Rollback-safe action ${action.code} considered`);
      confidence += 5;
      continue;
    }
    if (action.estimatedMinutes > 30) {
      rationale.push(`Long-running action ${action.code} delayed in plan`);
      continue;
    }
    confidence += 10;
  }

  if (normalizedSeverity === 'high') confidence += 15;

  return {
    scenarioId: scenario.id,
    incidentContext: context,
    confidence: Math.min(100, confidence),
    rationale,
    actions: ordered,
  };
};

export const createPlannedRun = (
  scenario: RecoveryScenario,
  context: IncidentContext,
  decision: ScenarioDecision,
): PlannedRun => {
  const requiresManualApproval = decision.actions.some((action) => action.requiredApprovals > 0);
  const estimatedMinutes = Math.max(
    1,
    decision.actions.reduce((acc, action) => acc + Math.max(1, action.estimatedMinutes), 0),
  );
  return {
    runId: `${context.incidentId}:run:${scenario.id}` as PlannedRun['runId'],
    incidentId: context.incidentId,
    scenarioId: scenario.id,
    actionCodes: [...new Set(decision.actions.map((action) => action.code))],
    estimatedMinutes,
    requiresManualApproval,
  };
};

export const buildExecutionEnvelope = (scenario: RecoveryScenario, context: IncidentContext) => {
  const decision = evaluateScenario(scenario, context);
  const run = createPlannedRun(scenario, context, decision);
  const metrics = computeMetrics(context);
  return {
    scenario,
    context,
    decision,
    run,
    metrics,
  };
};
