import { fail, ok, Result } from '@shared/result';
import {
  IncidentIntentStatus,
  IntentEnvelope,
  IntentId,
  RecoveryIntent,
} from '@domain/recovery-cockpit-orchestration-core';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { IntentQueryFilter, IntentStore, IntentStoreSnapshot, IntentRelationStore, IntentEnvelopeStore, PlanLink } from './types';

class IntentRepositoryStore implements IntentStore {
  private readonly records = new Map<IntentId, RecoveryIntent>();

  async upsertIntent(intent: RecoveryIntent): Promise<Result<RecoveryIntent, Error>> {
    this.records.set(intent.intentId, intent);
    return ok(intent);
  }

  async getIntent(intentId: IntentId): Promise<Result<RecoveryIntent | undefined, Error>> {
    return ok(this.records.get(intentId));
  }

  async listIntents(filter?: IntentQueryFilter): Promise<Result<readonly RecoveryIntent[], Error>> {
    const values = [...this.records.values()];
    const filtered = values.filter((intent) => {
      if (filter?.status) {
        if (intent.status !== filter.status) {
          return false;
        }
      }
      if (filter?.scope && intent.scope !== filter.scope) {
        return false;
      }
      if (filter?.zone && intent.zone !== filter.zone) {
        return false;
      }
      if (filter?.operator && intent.operator !== filter.operator) {
        return false;
      }
      return true;
    });
    return ok(filtered);
  }

  async removeIntent(intentId: IntentId): Promise<Result<boolean, Error>> {
    return ok(this.records.delete(intentId));
  }

  async snapshot(): Promise<Result<IntentStoreSnapshot, Error>> {
    const all = [...this.records.values()];
    const active = all.filter((intent) => intent.status === 'active').length;
    const completed = all.filter((intent) => intent.status === 'completed').length;
    const aborted = all.filter((intent) => intent.status === 'aborted').length;

    return ok({
      generatedAt: new Date().toISOString(),
      totalIntents: all.length,
      active,
      completed,
      aborted,
    });
  }
}

class IntentEnvelopeRepository implements IntentEnvelopeStore {
  private readonly map = new Map<IntentId, readonly IntentEnvelope[]>();

  async appendEnvelope(intent: RecoveryIntent, envelope: IntentEnvelope): Promise<Result<void, Error>> {
    const existing = this.map.get(intent.intentId) ?? [];
    this.map.set(intent.intentId, [...existing, envelope]);
    return ok(undefined);
  }

  async listEnvelopes(intentId: IntentId): Promise<Result<readonly IntentEnvelope[], Error>> {
    const envelopes = this.map.get(intentId) ?? [];
    return ok(envelopes);
  }
}

class RelationStore implements IntentRelationStore {
  private readonly links = new Map<IntentId, readonly PlanLink[]>();

  async linkPlan(intentId: IntentId, planId: RecoveryPlan['planId']): Promise<Result<void, Error>> {
    const existing = this.links.get(intentId) ?? [];
    const duplicate = existing.some((link) => link.planId === planId);
    if (duplicate) {
      return fail(new Error(`Plan ${planId} already linked`));
    }

    const next: PlanLink = { intentId, planId, linkedAt: new Date().toISOString() };
    this.links.set(intentId, [...existing, next]);
    return ok(undefined);
  }

  async listLinks(intentId: IntentId): Promise<Result<readonly PlanLink[], Error>> {
    return ok(this.links.get(intentId) ?? []);
  }
}

export class InMemoryIntentStore implements IntentStore, IntentEnvelopeStore, IntentRelationStore {
  private readonly core = new IntentRepositoryStore();
  private readonly envelopes = new IntentEnvelopeRepository();
  private readonly relations = new RelationStore();

  upsertIntent(intent: RecoveryIntent): Promise<Result<RecoveryIntent, Error>> {
    return this.core.upsertIntent(intent);
  }

  getIntent(intentId: IntentId): Promise<Result<RecoveryIntent | undefined, Error>> {
    return this.core.getIntent(intentId);
  }

  listIntents(filter?: IntentQueryFilter): Promise<Result<readonly RecoveryIntent[], Error>> {
    return this.core.listIntents(filter);
  }

  removeIntent(intentId: IntentId): Promise<Result<boolean, Error>> {
    return this.core.removeIntent(intentId);
  }

  snapshot(): Promise<Result<any, Error>> {
    return this.core.snapshot();
  }

  appendEnvelope(intent: RecoveryIntent, envelope: IntentEnvelope): Promise<Result<void, Error>> {
    return this.envelopes.appendEnvelope(intent, envelope);
  }

  listEnvelopes(intentId: IntentId): Promise<Result<readonly IntentEnvelope[], Error>> {
    return this.envelopes.listEnvelopes(intentId);
  }

  linkPlan(intentId: IntentId, planId: RecoveryPlan['planId']): Promise<Result<void, Error>> {
    return this.relations.linkPlan(intentId, planId);
  }

  listLinks(intentId: IntentId): Promise<Result<readonly PlanLink[], Error>> {
    return this.relations.listLinks(intentId);
  }
}

export const normalizeStatus = (status: IncidentIntentStatus): RecoveryIntent['status'] => status;

export const createStoreFacade = () => new InMemoryIntentStore();
