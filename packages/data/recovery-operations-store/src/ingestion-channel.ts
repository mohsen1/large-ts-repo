import type { RunSession, RunPlanSnapshot } from '@domain/recovery-operations-models';
import { buildTelemetryEntry } from './telemetry-index';
import type { RecoveryOperationsRepository } from './repository';

type ChannelType = 'sessions' | 'plans' | 'decisions';

type ChannelTelemetrySignal = 'run' | 'plan' | 'decision';

const normalizeSignal = (channel: ChannelType): ChannelTelemetrySignal => {
  if (channel === 'sessions') return 'run';
  if (channel === 'plans') return 'plan';
  return 'decision';
};

export interface IngestionEnvelope<T> {
  readonly eventId: string;
  readonly channel: ChannelType;
  readonly tenant: string;
  readonly payload: T;
}

export interface ChannelOptions {
  readonly tenant: string;
  readonly batchSize: number;
}

export interface IngestionResult {
  readonly enqueued: number;
  readonly skipped: number;
  readonly errors: readonly string[];
  readonly at: string;
}

const defaultBatch = 50;

export const buildSessionEnvelope = (tenant: string, session: RunSession): IngestionEnvelope<RunSession> => ({
  eventId: `${tenant}:session:${session.id}`,
  channel: 'sessions',
  tenant,
  payload: session,
});

export const buildPlanEnvelope = (tenant: string, plan: RunPlanSnapshot): IngestionEnvelope<RunPlanSnapshot> => ({
  eventId: `${tenant}:plan:${plan.id}`,
  channel: 'plans',
  tenant,
  payload: plan,
});

export const buildDecisionEnvelope = <T>(tenant: string, decision: T): IngestionEnvelope<T> => ({
  eventId: `${tenant}:decision:${Date.now()}`,
  channel: 'decisions',
  tenant,
  payload: decision,
});

export class RecoveryOperationsIngestionChannel {
  private readonly queue: Array<IngestionEnvelope<unknown>> = [];

  constructor(private readonly repository: RecoveryOperationsRepository, private readonly options: ChannelOptions) {}

  enqueueSessions(sessions: readonly RunSession[]): IngestionResult {
    const errors: string[] = [];
    const toEnqueue = sessions.filter((session) => {
      if (!session.id || !session.runId) {
        errors.push(`invalid session ${JSON.stringify(session)}`);
        return false;
      }
      return true;
    });

    for (const session of toEnqueue) {
      this.queue.push(buildSessionEnvelope(this.options.tenant, session));
      this.repository.upsertSession(session).catch((error) => {
        errors.push(error instanceof Error ? error.message : String(error));
      });
    }

    return {
      enqueued: toEnqueue.length,
      skipped: sessions.length - toEnqueue.length,
      errors,
      at: new Date().toISOString(),
    };
  }

  enqueuePlans(plans: readonly RunPlanSnapshot[]): IngestionResult {
    const errors: string[] = [];
    const toEnqueue = plans.filter((plan) => {
      if (!plan.id || !plan.name) {
        errors.push(`invalid plan ${JSON.stringify(plan)}`);
        return false;
      }
      return true;
    });

    for (const plan of toEnqueue) {
      this.queue.push(buildPlanEnvelope(this.options.tenant, plan));
      this.repository.upsertPlan(plan).catch((error) => {
        errors.push(error instanceof Error ? error.message : String(error));
      });
    }

    return {
      enqueued: toEnqueue.length,
      skipped: plans.length - toEnqueue.length,
      errors,
      at: new Date().toISOString(),
    };
  }

  takeBatch<T>(channel?: IngestionEnvelope<T>['channel']): IngestionResult {
    const max = this.options.batchSize || defaultBatch;
    const before = this.queue.length;

    const selected = this.queue
      .splice(0, max)
      .filter((entry): entry is IngestionEnvelope<T> => (channel ? entry.channel === channel : true));

    const errors: string[] = [];

    for (const item of selected) {
      const telemetry = buildTelemetryEntry(item.tenant, normalizeSignal(item.channel), item.payload);
      if (!telemetry.id) {
        errors.push(`missing telemetry for ${item.eventId}`);
      }
    }

    return {
      enqueued: before - this.queue.length,
      skipped: 0,
      errors,
      at: new Date().toISOString(),
    };
  }

  getQueueDepth(): number {
    return this.queue.length;
  }

  peekBatch(limit: number): readonly IngestionEnvelope<unknown>[] {
    return this.queue.slice(0, limit);
  }
}
