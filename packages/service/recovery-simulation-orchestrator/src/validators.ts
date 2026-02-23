import { buildManifest, type SimulationManifestPlan } from '@domain/recovery-simulation-core';
import type {
  RecoverySimulationLabResult,
  SimulationLabBlueprint,
  SimulationPlanDraft,
  SimulationPlanProjection,
} from '@domain/recovery-simulation-lab-models';
import { buildSimulationPlan } from '@domain/recovery-simulation-lab-models/src/planner';
import { hasHighRisk } from '@domain/recovery-simulation-lab-models/src/analysis';
import { validateDraft } from '@domain/recovery-simulation-lab-models/src/validation';

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: 'low' | 'medium' | 'high';
}

export interface SimulationValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly result?: RecoverySimulationLabResult;
  readonly manifest?: SimulationManifestPlan;
  readonly projection?: SimulationPlanProjection;
}

const issue = (code: string, message: string, severity: ValidationIssue['severity']): ValidationIssue => ({
  code,
  message,
  severity,
});

export const validateAndBuildLabPlan = (
  blueprint: SimulationLabBlueprint,
  draft: SimulationPlanDraft,
  scenario: SimulationManifestPlan,
): SimulationValidationResult => {
  const plan = buildSimulationPlan({ blueprint, draft }, { enforceCapacity: true, includeWarnings: true });

  const issues: ValidationIssue[] = [];
  const draftCheck = validateDraft(draft);
  if (!draftCheck.ok) {
    issues.push(issue('draft', draftCheck.issues.map((item) => item.message).join("\n"), 'high'));
  }

  if (plan.ledger.warnings.some((value) => value.includes('pressure'))) {
    issues.push(issue('pressure', 'resource pressure observed', 'medium'));
  }

  if (plan.ledger.warnings.length > 4) {
    issues.push(issue('many-warnings', `excess warnings=${plan.ledger.warnings.length}`, 'low'));
  }

  if (hasHighRisk(plan)) {
    issues.push(issue('risk', 'run is high risk and needs mitigation', 'high'));
  }

  if (draft.maxParallelSteps > 12) {
    issues.push(issue('parallelism', 'parallelism exceeds operational comfort', 'medium'));
  }

  if (plan.ledger.bandSignals.length === 0) {
    issues.push(issue('no-signals', 'no band signals generated', 'medium'));
  }

  return {
    ok: issues.every((entry) => entry.severity !== 'high'),
    issues,
    result: plan,
    manifest: scenario,
    projection: plan.projection,
  };
};
