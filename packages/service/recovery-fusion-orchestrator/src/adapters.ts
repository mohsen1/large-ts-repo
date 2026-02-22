import { fail, ok, type Result } from '@shared/result';
import { z } from 'zod';
import type { FusionBus, FusionLifecycleEvent, FusionMetrics, FusionStore } from './types';
import type { FusionBundle, FusionBundleId } from '@domain/recovery-fusion-intelligence';
import type { RecoveryRunState } from '@domain/recovery-orchestration';

const eventSchema = z.object({
  eventId: z.string(),
  eventType: z.union([
    z.literal('bundle_saved'),
    z.literal('wave_started'),
    z.literal('wave_completed'),
    z.literal('bundle_closed'),
  ]),
  tenant: z.string(),
  bundleId: z.string(),
  occurredAt: z.string(),
  payload: z.record(z.unknown()),
});

export class InMemoryFusionStore implements FusionStore {
  private readonly bundles = new Map<string, FusionBundle>();

  async save(bundle: FusionBundle): Promise<void> {
    this.bundles.set(bundle.id, bundle);
  }

  async get(bundleId: FusionBundleId): Promise<FusionBundle | undefined> {
    return this.bundles.get(bundleId);
  }

  async list(runId: RecoveryRunState['runId']): Promise<readonly FusionBundle[]> {
    return [...this.bundles.values()].filter((bundle) => bundle.runId === runId);
  }
}

export class NoopFusionBus implements FusionBus {
  private readonly handlers = new Map<string, Array<(payload: unknown) => void>>();

  async send(payload: unknown): Promise<Result<void, string>> {
    const parsed = eventSchema.safeParse(payload);
    if (!parsed.success) {
      return fail('INVALID_EVENT', 'invalid event payload');
    }

    const list = this.handlers.get(parsed.data.bundleId);
    if (list) {
      for (const handler of list) {
        handler(parsed.data);
      }
    }

    return ok(undefined);
  }

  async *receive(runId: RecoveryRunState['runId']): AsyncIterable<unknown> {
    const events: FusionLifecycleEvent[] = [];
    const handler = (payload: unknown) => {
      if (payload && typeof payload === 'object' && 'bundleId' in payload) {
        const record = payload as { bundleId: unknown; tenant: string; eventType: string };
        if (record.bundleId === runId) {
          events.push({
            eventId: `${runId}:${events.length}`,
            eventType: 'bundle_closed',
            tenant: record.tenant,
            bundleId: record.bundleId as FusionBundleId,
            occurredAt: new Date().toISOString(),
            payload: {},
          });
        }
      }
    };

    this.handlers.set(runId, [...(this.handlers.get(runId) ?? []), handler]);

    try {
      for (let i = 0; i < 3; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (events.length > 0) {
          break;
        }
      }
      for (const event of events) {
        yield event;
      }
    } finally {
      this.handlers.set(
        runId,
        (this.handlers.get(runId) ?? []).filter((item) => item !== handler),
      );
    }
  }
}

export const summarizeBundleStore = (store: FusionStore, runId: RecoveryRunState['runId']): Promise<number> =>
  store.list(runId).then((bundles) => bundles.length);

export const buildEmptyMetrics = (): FusionMetrics => ({
  latencyP50: 0,
  latencyP90: 0,
  commandCount: 0,
  evaluationCount: 0,
});
