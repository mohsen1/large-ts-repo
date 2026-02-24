import { z } from 'zod';
import { withBrand } from '@shared/core';
import type {
  CadencePlanCandidate,
  CadenceRunPlan,
  CadenceRunId,
  CadenceInput,
  CadenceRunAudit,
  CadenceSlot,
  CadenceWindow,
} from './types';

const cadencePlanCandidateSchema = z.object({
  profile: z.object({
    tenant: z.string().min(1),
    programRun: z.string().min(1),
    priority: z.enum(['low', 'normal', 'high', 'critical']),
    source: z.enum(['planner', 'operator', 'automation', 'policy']),
  }),
  revision: z.number().int().min(0),
  notes: z.array(z.string().min(1)),
});

export type CadencePlanCandidateEnvelope = {
  readonly id: string;
  readonly createdAt: string;
  readonly candidate: CadencePlanCandidate;
  readonly audit: CadenceRunAudit;
};

export type CadencePlanRunEnvelope = {
  readonly id: string;
  readonly receivedAt: string;
  readonly plan: CadenceRunPlan;
};

interface RegistryRecord<T> {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly payload: T;
}

const parseRunId = (value: string): CadenceRunId => value as CadenceRunId;

export class CadencePlanRegistry {
  private readonly candidates = new Map<string, RegistryRecord<CadencePlanCandidateEnvelope>>();
  private readonly plans = new Map<string, RegistryRecord<CadencePlanRunEnvelope>>();
  private readonly windows = new Map<string, RegistryRecord<CadenceWindow>>();
  private readonly slots = new Map<string, RegistryRecord<CadenceSlot>>();

  constructor(private readonly ttlMinutes = 30) {}

  registerCandidate(candidate: CadencePlanCandidate, runId: CadenceRunId): CadencePlanCandidateEnvelope {
    const now = new Date().toISOString();
    const candidateId = `${candidate.profile.programRun}-${candidate.revision}-${Date.now()}`;
    const validated = cadencePlanCandidateSchema.parse({
      profile: {
        tenant: candidate.profile.tenant,
        programRun: candidate.profile.programRun,
        priority: candidate.profile.priority,
        source: candidate.profile.source,
      },
      revision: candidate.revision,
      notes: [...candidate.notes],
    });

    const envelope: CadencePlanCandidateEnvelope = {
      id: candidateId,
      createdAt: now,
      candidate,
      audit: {
        createdBy: 'planner',
        reviewedBy: [withBrand('auditor', 'UserId')],
        approved: candidate.notes.length === 0,
        reasonTrail: validated.notes,
      },
    };

    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000).toISOString();
    this.candidates.set(candidateId, {
      id: candidateId,
      createdAt: now,
      expiresAt,
      payload: envelope,
    });

    return envelope;
  }

  registerPlan(plan: CadenceRunPlan, runId: CadenceRunId): CadencePlanRunEnvelope {
    const now = new Date().toISOString();
    const planId = `${plan.id}`;
    const envelope: CadencePlanRunEnvelope = {
      id: planId,
      receivedAt: now,
      plan,
    };

    const expiresAt = new Date(Date.now() + this.ttlMinutes * 2 * 60_000).toISOString();
    this.plans.set(planId, {
      id: planId,
      createdAt: now,
      expiresAt,
      payload: envelope,
    });

    for (const window of plan.windows) {
      const windowId = `${plan.runId}:${String(window.id)}`;
      this.windows.set(windowId, {
        id: windowId,
        createdAt: now,
        expiresAt,
        payload: window,
      });
    }

    for (const slot of plan.slots) {
      const slotId = `${plan.runId}:${String(slot.id)}`;
      this.slots.set(slotId, {
        id: slotId,
        createdAt: now,
        expiresAt,
        payload: slot,
      });
    }

    return envelope;
  }

  getCandidate(id: string): CadencePlanCandidateEnvelope | undefined {
    const entry = this.candidates.get(id);
    if (!entry) return undefined;
    if (this.isExpired(entry.expiresAt)) {
      this.candidates.delete(id);
      return undefined;
    }
    return entry.payload;
  }

  getPlan(id: string): CadencePlanRunEnvelope | undefined {
    const entry = this.plans.get(id);
    if (!entry) return undefined;
    if (this.isExpired(entry.expiresAt)) {
      this.plans.delete(id);
      return undefined;
    }
    return entry.payload;
  }

  listRecentCandidates(limit = 20): CadencePlanCandidateEnvelope[] {
    return this.collect(this.candidates)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((record) => record.payload);
  }

  listRecentPlans(limit = 20): CadencePlanRunEnvelope[] {
    return this.collect(this.plans)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((record) => record.payload);
  }

  removeRun(runId: CadenceRunId): void {
    for (const key of this.plans.keys()) {
      if (key.startsWith(`${runId}:`) || key.endsWith(`:${runId}`) || key === runId) {
        this.plans.delete(key);
      }
    }

    for (const key of this.candidates.keys()) {
      if (key.startsWith(String(runId))) {
        this.candidates.delete(key);
      }
    }

    for (const key of this.windows.keys()) {
      if (key.startsWith(`${runId}:`)) {
        this.windows.delete(key);
      }
    }

    for (const key of this.slots.keys()) {
      if (key.startsWith(`${runId}:`)) {
        this.slots.delete(key);
      }
    }
  }

  private collect<T>(records: Map<string, RegistryRecord<T>>): RegistryRecord<T>[] {
    return Array.from(records.values()).filter((record) => {
      if (this.isExpired(record.expiresAt)) {
        records.delete(record.id);
        return false;
      }
      return true;
    });
  }

  private isExpired(expiresAt: string): boolean {
    return new Date(expiresAt).getTime() <= Date.now();
  }
}

export const createPlanInput = (
  candidate: CadencePlanCandidate,
): CadenceInput<CadenceRunId> => ({
  mode: 'candidate',
  candidate,
  runId: parseRunId(candidate.profile.programRun),
});

export const makeWindowFingerprint = (window: CadenceWindow): string =>
  `${window.id}:${window.startsAt}:${window.endsAt}:${window.maxParallelism}:${window.maxRetries}`;

export const makeSlotFingerprint = (slot: CadenceSlot): string =>
  `${slot.id}:${slot.stepId}:${slot.windowId}:${slot.weight}:${slot.estimatedMinutes}`;
