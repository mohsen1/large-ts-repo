import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { RecoveryActionCandidate, RecoverySignalBundle } from '@domain/recovery-intelligence';
import { parseBundle } from '@domain/recovery-intelligence';
import type { StoredActionPlan } from './models';

export const buildRunbookFromActions = (actions: readonly RecoveryActionCandidate[]): readonly string[] =>
  actions.map((action) => `[${action.actionId}] ${action.targetService}: ${action.description}`);

export const buildPlanPayload = (bundle: RecoverySignalBundle, actions: readonly RecoveryActionCandidate[]): Result<StoredActionPlan, Error> => {
  const parsed = parseBundle(bundle);
  const runbook = buildRunbookFromActions(actions);
  const actionText = JSON.stringify(actions);
  if (actionText.length > 32_000) return fail(new Error('plan-too-large'));

  return ok({
    planId: `${parsed.bundleId}-plan` as StoredActionPlan['planId'],
    tenantId: parsed.context.tenantId,
    bundleId: parsed.bundleId,
    actions,
    runbook,
    createdAt: new Date().toISOString(),
  });
};
