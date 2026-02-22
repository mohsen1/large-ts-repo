import { err, ok, type Result } from '@shared/result';
import type { OrchestrationSignal, PlanRevision, TenantId } from '@domain/recovery-orchestration-planning/src/incident-models';
import {
  composeCandidates,
  buildSimulationEnvelope,
  type CandidateSelection,
  type PlannerInput,
} from '@domain/recovery-orchestration-planning/src/scenario-planner';
import {
  evaluateCandidateRisk,
  type CandidateRiskSummary,
  mergeRiskSummaries,
} from '@domain/recovery-orchestration-planning/src/risk-calculator';
import {
  assessCandidateConstraints,
  type ConstraintProfile,
  combineConstraintProfile,
  summarizeConstraintFailures,
} from '@domain/recovery-orchestration-planning/src/constraint-engine';
import type { RecoveryScenarioTemplate, ScenarioBudget } from '@domain/recovery-orchestration-planning/src/incident-models';

type Revision = PlanRevision;

export interface WorkflowInput {
  readonly tenantId: TenantId;
  readonly incidentId: string;
  readonly templates: readonly RecoveryScenarioTemplate[];
  readonly signals: readonly OrchestrationSignal[];
  readonly options: {
    readonly templateCount: number;
    readonly templateLimit: number;
    readonly minSignals: number;
    readonly maxRiskScore: number;
  };
}

export interface WorkflowResult {
  readonly tenantId: TenantId;
  readonly summary: {
    readonly selectedCount: number;
    readonly blockedCount: number;
    readonly selected: string;
    readonly revision: Revision;
  };
  readonly windows: readonly ReturnType<typeof buildSimulationEnvelope>[];
  readonly candidates: readonly CandidateRiskSummary[];
  readonly aggregateRisk: ReturnType<typeof mergeRiskSummaries>;
  readonly reasonMap: Record<string, readonly string[]>;
}

const defaultProfile = (override: Partial<ConstraintProfile>): ConstraintProfile => ({
  minSignals: override.minSignals ?? 1,
  minConfidence: override.minConfidence ?? 40,
  maxRiskScore: override.maxRiskScore ?? 80,
  maxWindowMinutes: override.maxWindowMinutes ?? 180,
  minWindowMinutes: override.minWindowMinutes ?? 8,
  allowUnverified: override.allowUnverified ?? true,
});

const buildBudget = (templatesCount: number): ScenarioBudget => ({
  maxParallelism: 4,
  budgetMinutes: Math.max(30, templatesCount * 18),
  budgetCostUnits: Math.max(50, templatesCount * 24),
  riskTolerance: 3,
});

const makeCandidateSelection = (input: WorkflowInput): CandidateSelection => {
  const truncatedTemplates = input.templates.slice(0, Math.max(1, input.options.templateLimit));

  return composeCandidates({
    tenantId: input.tenantId,
    incidentId: input.incidentId,
    service: 'orchestrator-service',
    domain: input.templates[0]?.domain ?? 'platform',
    timestamp: new Date().toISOString(),
    templates: truncatedTemplates,
    signals: truncatedTemplates.flatMap((template) => template.signals),
  });
};

export const runRecoveryScenarioWorkflow = (input: WorkflowInput): Result<WorkflowResult, string> => {
  const selection = makeCandidateSelection(input);
  if (selection.selected.length === 0) {
    return err('workflow:empty-selection');
  }

  const signals = [...input.signals].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const baseBudget = buildBudget(input.options.templateCount);

  const windows = selection.selected.map(buildSimulationEnvelope);
  const constraints = selection.selected.map((candidate) => {
    const checks = assessCandidateConstraints(
      candidate,
      baseBudget,
      defaultProfile({
        minSignals: Math.max(input.options.minSignals, 1),
        maxRiskScore: input.options.maxRiskScore,
      }),
      {
        profile: defaultProfile({
          minSignals: 1,
          minConfidence: 20,
          maxRiskScore: input.options.maxRiskScore,
          maxWindowMinutes: 180,
          minWindowMinutes: 8,
          allowUnverified: true,
        }),
        disabled: candidate.template.state === 'retired' ? ['template-retired'] : [],
        featureFlags: ['risk-profile-v2'],
      },
    );

    return {
      candidateId: candidate.scenarioId,
      candidate,
      blockedReasons: summarizeConstraintFailures(checks),
      checks,
    };
  });

  const candidates = constraints.map(({ candidate }) =>
    evaluateCandidateRisk(candidate, signals, selection.selected[0].template.steps.length > 3 ? 120 : 90),
  );

  const riskProfile = mergeRiskSummaries(candidates);
  const selected = constraints.find((entry) => entry.blockedReasons.length === 0) ?? constraints[0];
  if (!selected) {
    return err('workflow:all-blocked');
  }

  const reasonMap: Record<string, readonly string[]> = {};
  for (const constraint of constraints) {
    reasonMap[constraint.candidateId] = constraint.blockedReasons;
  }

  return ok({
    tenantId: input.tenantId,
    summary: {
      selectedCount: selection.selected.length,
      blockedCount: constraints.filter((entry) => entry.blockedReasons.length > 0).length,
      selected: selected.candidateId,
      revision: selection.selected[0].revision,
    },
    windows,
    candidates,
    aggregateRisk: riskProfile,
    reasonMap,
  });
};
