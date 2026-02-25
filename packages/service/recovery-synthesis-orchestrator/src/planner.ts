import {
  type OrchestratorState,
  type OrchestratorEnvelope,
  type OrchestrationInput,
  type PlannerOutput,
  type OrchestrationRunId,
} from './types';
import {
  ScenarioDependencyGraph,
  buildConstraintsFromBlueprint,
  evaluatePolicySummary,
  evaluateScenarioPolicy,
} from '@domain/recovery-scenario-lens';
import {
  detectConstraintViolations,
  rankPlans,
  scoreCandidate,
} from '@domain/recovery-scenario-lens/risk';

export const runPlanner = (input: OrchestrationInput): PlannerOutput => {
  const graph = new ScenarioDependencyGraph(input.blueprint.commands, input.blueprint.links, input.blueprint.scenarioId);

  const policyContext = {
    profile: input.profile,
    commandCount: input.blueprint.commands.length,
    hasManualIntervention: input.initiatedBy.length > 0,
    signals: input.signals.map((signal) => signal.signalId),
  };

  const policyEvaluations = evaluateScenarioPolicy(input.profile, input.blueprint, policyContext);
const policyScore = evaluatePolicySummary(policyEvaluations);

  const baseCandidate = graph.toPlanCandidate(1, input.blueprint.windowMinutes);
  const scoredCandidate = {
    ...baseCandidate,
    score: scoreCandidate(baseCandidate),
    resourceUse: baseCandidate.resourceUse,
  };

  const candidateSet = rankPlans([scoredCandidate]);
  const constraints = [...buildConstraintsFromBlueprint(input.blueprint, policyContext), ...input.constraints];
  const warnings = [
    ...detectConstraintViolations(scoredCandidate, constraints).map((violation: { readonly constraintId: string; observed: number }) => `${violation.constraintId}:${violation.observed}`),
    ...constraints
      .filter((constraint) => constraint.type === 'region_gate')
      .map((constraint) => `region_gate:${constraint.description}`),
  ];

  return {
    candidates: candidateSet,
    score: policyScore,
    constraints,
    warnings,
  };
};

export const seedState = (runId: OrchestrationRunId, envelope: OrchestratorEnvelope): OrchestrationStatePatch => {
  return {
    runId,
    state: {
      currentRun: envelope,
      planHistory: [runId],
      activeSignals: envelope.model.blueprint.signals,
    },
    status: envelope.status,
  };
};

export interface OrchestrationStatePatch {
  readonly runId: string;
  readonly state: Pick<OrchestratorState, 'currentRun' | 'planHistory' | 'activeSignals'>;
  readonly status: OrchestratorEnvelope['status'];
}
