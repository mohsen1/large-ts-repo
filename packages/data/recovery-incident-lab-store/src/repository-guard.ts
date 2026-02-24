import type { LabStoreError, LabStoreResult } from './types';
import { ok, fail } from '@shared/result';
import type { IncidentLabScenario, IncidentLabPlan, IncidentLabRun } from '@domain/recovery-incident-lab-core';
import type { RecoveryIncidentLabRepository } from './repository';

const ERROR_CODES = {
  missingScenario: 'not_found',
  missingPlan: 'not_found',
  missingRun: 'not_found',
  mismatch: 'invalid',
} as const;

type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

type GuardResult<T> = LabStoreResult<T>;

const buildMissing = (kind: string, code: ErrorCode): LabStoreError => ({
  code,
  message: `${kind} not found`,
});

export const ensureScenarioExists = async (
  repository: RecoveryIncidentLabRepository,
  scenarioId: string,
): Promise<GuardResult<IncidentLabScenario>> => {
  const record = await repository.loadScenario(scenarioId);
  if (record.ok) {
    return ok(record.value);
  }
  return fail(buildMissing(`scenario:${scenarioId}`, ERROR_CODES.missingScenario));
};

export const ensurePlanExists = async (
  repository: RecoveryIncidentLabRepository,
  scenarioId: string,
): Promise<GuardResult<IncidentLabPlan>> => {
  const records = await repository.listPlansByScenario(scenarioId);
  const plan = records.items[0];
  if (plan) {
    return ok(plan);
  }
  return fail(buildMissing(`plan:${scenarioId}`, ERROR_CODES.missingPlan));
};

export const ensureLatestRunExists = async (
  repository: RecoveryIncidentLabRepository,
  scenarioId: string,
): Promise<GuardResult<IncidentLabRun>> => {
  const record = await repository.loadLatestRunByScenario(scenarioId);
  if (record.ok) {
    return ok(record.value);
  }
  return fail(buildMissing(`latest-run:${scenarioId}`, ERROR_CODES.missingRun));
};

export const validatePlanForScenario = async (
  repository: RecoveryIncidentLabRepository,
  scenarioId: string,
  planId: string,
): Promise<GuardResult<{ readonly scenario: IncidentLabScenario; readonly plan: IncidentLabPlan }>> => {
  const scenario = await ensureScenarioExists(repository, scenarioId);
  if (!scenario.ok) {
    return fail(scenario.error);
  }

  const plans = await repository.listPlansByScenario(scenarioId);
  const candidate = plans.items.find((candidate) => candidate.id === planId);
  if (!candidate) {
    return fail(buildMissing(`plan-id:${planId}`, ERROR_CODES.mismatch));
  }

  if (candidate.scenarioId !== scenarioId) {
    return fail(buildMissing('plan-scenario-mismatch', ERROR_CODES.mismatch));
  }

  return ok({
    scenario: scenario.value,
    plan: candidate,
  });
};

export const repositoryGuard = {
  ensureScenarioExists,
  ensurePlanExists,
  ensureLatestRunExists,
  validatePlanForScenario,
};
