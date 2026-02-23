import { RecoveryIntent, IncidentIntentStatus, IntentEnvelope, IntentId } from '@domain/recovery-cockpit-orchestration-core';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { Result } from '@shared/result';

export type IntentStoreSnapshot = Readonly<{
  generatedAt: string;
  totalIntents: number;
  active: number;
  completed: number;
  aborted: number;
}>;

export type IntentQueryFilter = Readonly<{
  status?: IncidentIntentStatus;
  scope?: string;
  zone?: string;
  operator?: string;
}>;

export interface IntentStore {
  upsertIntent(intent: RecoveryIntent): Promise<Result<RecoveryIntent, Error>>;
  getIntent(intentId: IntentId): Promise<Result<RecoveryIntent | undefined, Error>>;
  listIntents(filter?: IntentQueryFilter): Promise<Result<readonly RecoveryIntent[], Error>>;
  removeIntent(intentId: IntentId): Promise<Result<boolean, Error>>;
  snapshot(): Promise<Result<IntentStoreSnapshot, Error>>;
}

export interface IntentEnvelopeStore {
  appendEnvelope(intent: RecoveryIntent, envelope: IntentEnvelope): Promise<Result<void, Error>>;
  listEnvelopes(intentId: IntentId): Promise<Result<readonly IntentEnvelope[], Error>>;
}

export interface PlanLink {
  intentId: IntentId;
  planId: RecoveryPlan['planId'];
  linkedAt: string;
}

export interface IntentRelationStore {
  linkPlan(intentId: IntentId, planId: RecoveryPlan['planId']): Promise<Result<void, Error>>;
  listLinks(intentId: IntentId): Promise<Result<readonly PlanLink[], Error>>;
}
