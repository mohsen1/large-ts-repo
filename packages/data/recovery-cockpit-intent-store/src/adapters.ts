import { RecoveryIntent } from '@domain/recovery-cockpit-orchestration-core';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { InMemoryIntentStore } from './inMemoryIntentRepository';
import { PlanLink } from './types';
import { IntentSearchHit } from './intentQueries';

export const seedIntentStore = async (): Promise<{
  intentStore: InMemoryIntentStore;
}> => {
  const intentStore = new InMemoryIntentStore();
  return { intentStore };
};

export const intentStatusEquals = (left: RecoveryIntent, right: RecoveryIntent): boolean => left.status === right.status;

export const samePlan = (left: RecoveryPlan['planId'], right: RecoveryPlan['planId']): boolean => left === right;

export const isIntentActive = (intent: RecoveryIntent): boolean =>
  intent.status === 'active' || intent.status === 'monitoring' || intent.status === 'scheduled';

export const enrichHit = (
  hit: IntentSearchHit,
  links: readonly PlanLink[],
): IntentSearchHit & { linkedPlans: RecoveryPlan['planId'][] } => ({
  ...hit,
  linkedPlans: links.filter((link) => link.intentId === hit.intent.intentId).map((link) => link.planId),
});
