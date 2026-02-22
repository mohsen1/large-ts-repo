import { EventBridgeClient, PutEventsCommand, PutEventsCommandInput } from '@aws-sdk/client-eventbridge';
import type { ContinuityPlanId, ContinuityRunId, ContinuityTenantId } from '@domain/recovery-continuity-planning';
import { fail, ok, type Result } from '@shared/result';

interface BridgeConfig {
  readonly region?: string;
  readonly eventBusName: string;
}

export interface ContinuityEvent {
  readonly tenantId: ContinuityTenantId;
  readonly planId: ContinuityPlanId;
  readonly runId: ContinuityRunId;
  readonly eventName: string;
  readonly payload: Record<string, unknown>;
}

export interface ContinuityEventBridge {
  emit(event: ContinuityEvent): Promise<Result<void, Error>>;
  emitBatch(events: readonly ContinuityEvent[]): Promise<Result<void, Error>>;
}

const detailTypeFor = (eventName: string) => `continuity.${eventName}`;

export class ContinuityEventBridgeAdapter implements ContinuityEventBridge {
  private readonly client: EventBridgeClient;

  constructor(private readonly config: BridgeConfig, client = new EventBridgeClient({ region: config.region ?? 'us-east-1' })) {
    this.client = client;
  }

  async emit(event: ContinuityEvent): Promise<Result<void, Error>> {
    return this.emitBatch([event]);
  }

  async emitBatch(events: readonly ContinuityEvent[]): Promise<Result<void, Error>> {
    try {
      if (!events.length) return ok(undefined);
      const Entries: PutEventsCommandInput['Entries'] = events.map((event) => ({
        EventBusName: this.config.eventBusName,
        Source: 'recovery-continuity-planning',
        DetailType: detailTypeFor(event.eventName),
        Detail: JSON.stringify(event.payload),
        Time: new Date(),
        Resources: [
          `${event.tenantId}::${event.planId}::${event.runId}`,
        ],
      }));

      await this.client.send(new PutEventsCommand({ Entries }));
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }
}
