import { randomUUID } from 'node:crypto';
import type { CampaignId, CampaignSnapshot, CampaignRunResult, CampaignPlan, RunId, TenantId, PlanId, CheckpointId, CampaignEnvelope } from './types';

export interface CampaignStoreAdapter {
  loadCampaignCheckpoint<TPayload>(tenantId: TenantId, campaignId: CampaignId): Promise<CampaignSnapshot<TPayload> | undefined>;
  persistCampaignCheckpoint<TPayload>(snapshot: CampaignSnapshot<TPayload>): Promise<void>;
  persistRunResult<TPayload>(result: CampaignRunResult<TPayload>): Promise<void>;
  loadPlan<TPayload>(tenantId: TenantId, planId: PlanId): Promise<CampaignPlan<TPayload> | undefined>;
  startRun(runId: RunId): Promise<CampaignRunSession>;
}

export interface CampaignRunSession {
  readonly id: RunId;
  readonly tenantId: string;
  readonly startedAt: string;
  [Symbol.asyncDispose](): Promise<void>;
}

export interface CampaignDispatchAdapter {
  publish<TPayload>(topic: string, envelope: CampaignEnvelope<TPayload>): Promise<void>;
  heartbeat<TPayload>(runId: RunId, envelope: CampaignEnvelope<TPayload>): Promise<void>;
}

export type CampaignAdapterBundle = {
  readonly store: CampaignStoreAdapter;
  readonly dispatch: CampaignDispatchAdapter;
};

export class InMemoryCampaignStoreAdapter implements CampaignStoreAdapter {
  readonly #checkpoints = new Map<string, CampaignSnapshot<unknown>>();
  readonly #runs = new Map<string, CampaignRunResult<unknown>>();
  readonly #plans = new Map<string, CampaignPlan<unknown>>();

  async loadCampaignCheckpoint<TPayload>(tenantId: TenantId, campaignId: CampaignId): Promise<CampaignSnapshot<TPayload> | undefined> {
    const key = `${tenantId}::${campaignId}`;
    return this.#checkpoints.get(key) as CampaignSnapshot<TPayload> | undefined;
  }

  async persistCampaignCheckpoint<TPayload>(snapshot: CampaignSnapshot<TPayload>): Promise<void> {
    const key = `${snapshot.tenantId}::${snapshot.campaignId}`;
    this.#checkpoints.set(key, snapshot as CampaignSnapshot<unknown>);
  }

  async persistRunResult<TPayload>(result: CampaignRunResult<TPayload>): Promise<void> {
    this.#runs.set(result.runId, result as CampaignRunResult<unknown>);
  }

  async loadPlan<TPayload>(tenantId: TenantId, planId: PlanId): Promise<CampaignPlan<TPayload> | undefined> {
    return this.#plans.get(planId) as CampaignPlan<TPayload> | undefined;
  }

  async savePlan<TPayload>(plan: CampaignPlan<TPayload>): Promise<void> {
    this.#plans.set(plan.planId, plan as CampaignPlan<unknown>);
  }

  async startRun(runId: RunId): Promise<CampaignRunSession> {
    return {
      id: runId,
      tenantId: '',
      startedAt: new Date().toISOString(),
      async [Symbol.asyncDispose]() {
        return Promise.resolve();
      },
    };
  }

  async debugList(): Promise<{ readonly checkpoints: number; readonly plans: number; readonly runs: number }> {
    return {
      checkpoints: this.#checkpoints.size,
      plans: this.#plans.size,
      runs: this.#runs.size,
    };
  }
}

export class SyntheticDispatchAdapter implements CampaignDispatchAdapter {
  readonly #events: Array<{ readonly topic: string; readonly payload: unknown; readonly at: string }> = [];

  async publish<TPayload>(topic: string, envelope: CampaignEnvelope<TPayload>): Promise<void> {
    const at = new Date().toISOString();
    this.#events.push({ topic, payload: envelope, at });
  }

  async heartbeat<TPayload>(runId: RunId, envelope: CampaignEnvelope<TPayload>): Promise<void> {
    const at = new Date().toISOString();
    this.#events.push({
      topic: `heartbeat:${runId}`,
      payload: envelope,
      at,
    });
  }

  get events(): readonly { readonly topic: string; readonly payload: unknown; readonly at: string }[] {
    return this.#events;
  }
}

export class InMemoryCampaignAdapterBundle implements CampaignAdapterBundle {
  readonly store = new InMemoryCampaignStoreAdapter();
  readonly dispatch = new SyntheticDispatchAdapter();
}

export const withSyntheticAdapter = async <
  TResult,
>(
  run: (bundle: CampaignAdapterBundle) => Promise<TResult>,
): Promise<TResult> => {
  const bundle: CampaignAdapterBundle = {
    store: new InMemoryCampaignStoreAdapter(),
    dispatch: new SyntheticDispatchAdapter(),
  };

  await using session = new CampaignRunHandle(randomUUID());
  return run(bundle).finally(() => session[Symbol.asyncDispose]());
};

class CampaignRunHandle implements CampaignRunSession {
  readonly id: RunId;
  readonly tenantId: string;
  readonly startedAt = new Date().toISOString();

  constructor(private readonly runValue: string) {
    this.id = `run:${runValue}` as RunId;
    this.tenantId = `tenant:${runValue}`;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}

export const buildCheckpointId = (tenantId: TenantId, campaignId: CampaignId, planId: RunId): CheckpointId =>
  `${tenantId}:${campaignId}:${planId}` as CheckpointId;
