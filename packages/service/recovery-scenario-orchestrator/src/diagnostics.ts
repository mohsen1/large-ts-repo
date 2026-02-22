import { fail, ok, type Result } from '@shared/result';
import {
  buildSimulationEnvelope,
  composeCandidates,
  type CandidateSelection,
  type PlannerInput,
} from '@domain/recovery-orchestration-planning/src/scenario-planner';
import {
  assessCandidateConstraints,
  combineConstraintProfile,
  summarizeConstraintFailures,
  type ConstraintProfile,
  type ConstraintState,
} from '@domain/recovery-orchestration-planning/src/constraint-engine';
import {
  evaluateCandidateRisk,
  mergeRiskSummaries,
  type CandidateRiskSummary,
} from '@domain/recovery-orchestration-planning/src/risk-calculator';
import {
  type OrchestrationSignal,
  type PlanRevision,
  type ScenarioBudget,
  type SimulationEnvelope,
} from '@domain/recovery-orchestration-planning/src/incident-models';
import type { Result as SharedResult } from '@shared/result';

interface CandidateBudget {
  readonly maxParallelism: number;
  readonly budgetMinutes: number;
  readonly budgetCostUnits: number;
  readonly riskTolerance: ScenarioBudget['riskTolerance'];
}

export interface ScenarioScenarioRecord {
  readonly tenantId: string;
  readonly signalIds: readonly string[];
  readonly templates: readonly unknown[];
  readonly signals: readonly OrchestrationSignal[];
  readonly now: () => string;
  readonly defaultProfile: ConstraintProfile;
  readonly constraintsState: ConstraintState;
}

export interface CandidateDiagnosticResult {
  readonly candidateId: string;
  readonly revision: PlanRevision;
  readonly selected: boolean;
  readonly risk: CandidateRiskSummary;
  readonly blockingReasons: readonly string[];
  readonly windowCount: number;
  readonly checks: number;
  readonly envelope: SimulationEnvelope;
}

export interface ScenarioDiagnosticOutput {
  readonly tenantId: string;
  readonly candidateCount: number;
  readonly blockingCount: number;
  readonly failingReasons: readonly string[];
  readonly selected: string;
  readonly revisions: readonly PlanRevision[];
  readonly riskScore: number;
  readonly riskClassification: CandidateRiskSummary['profile']['classification'];
  readonly reasonMap: Record<string, readonly string[]>;
}

const defaultBudget = (templatesCount: number): CandidateBudget => ({
  maxParallelism: 4,
  budgetMinutes: Math.max(30, templatesCount * 20),
  budgetCostUnits: Math.max(40, templatesCount * 24),
  riskTolerance: 3,
});

const buildPlannerInput = (record: ScenarioScenarioRecord): PlannerInput => ({
  tenantId: record.tenantId as PlannerInput['tenantId'],
  incidentId: record.signalIds[0] ?? record.tenantId,
  service: 'scenario-workbench',
  domain: 'platform',
  timestamp: record.now(),
  templates: record.templates as never,
  signals: record.signalIds,
});

export const buildScenarioDiagnostics = (record: ScenarioScenarioRecord): readonly CandidateDiagnosticResult[] => {
  const selection: CandidateSelection = composeCandidates(buildPlannerInput(record));
  const budget = defaultBudget(selection.selected.length);
  const baseProfile = combineConstraintProfile(record.defaultProfile, {
    minSignals: Math.min(5, Math.max(1, record.signalIds.length)),
  });

  return selection.selected.map((candidate, index): CandidateDiagnosticResult => {
    const constraints = assessCandidateConstraints(
      candidate,
      budget,
      baseProfile,
      record.constraintsState,
    );
    const blockedReasons = summarizeConstraintFailures(constraints);
    const risk = evaluateCandidateRisk(candidate, record.signals, 150);
    const envelope = buildSimulationEnvelope(candidate);

    return {
      candidateId: candidate.scenarioId,
      revision: candidate.revision,
      selected: index === 0,
      risk,
      blockingReasons: blockedReasons,
      windowCount: candidate.budget.maxParallelism,
      checks: constraints.length,
      envelope,
    };
  });
};

export const buildScenarioSummary = (
  tenantId: string,
  diagnostics: readonly CandidateDiagnosticResult[],
): Result<ScenarioDiagnosticOutput, string> => {
  if (diagnostics.length === 0) return fail('empty-diagnostics');

  const passing = diagnostics.filter((entry) => entry.blockingReasons.length === 0);
  const aggregate = mergeRiskSummaries(diagnostics.map((entry) => entry.risk));
  const reasonMap = Object.fromEntries(
    diagnostics.map((entry) => [entry.candidateId, entry.blockingReasons] as const),
  );

  return ok({
    tenantId,
    candidateCount: diagnostics.length,
    blockingCount: diagnostics.length - passing.length,
    failingReasons: [...new Set(diagnostics.flatMap((entry) => entry.blockingReasons))].sort(),
    selected: diagnostics.find((entry) => entry.selected)?.candidateId ?? diagnostics[0]?.candidateId ?? '',
    revisions: diagnostics.map((entry) => entry.revision),
    riskScore: aggregate.score,
    riskClassification: aggregate.classification,
    reasonMap,
  });
};

export const buildAggregateResult = (
  tenantId: string,
  diagnostics: readonly CandidateDiagnosticResult[],
): SharedResult<ReturnType<typeof mergeRiskSummaries>, string> => {
  if (diagnostics.length === 0) return fail(`empty:${tenantId}`);
  return ok(mergeRiskSummaries(diagnostics.map((entry) => entry.risk)));
};
