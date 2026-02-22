import { EventBridgeClient, PutEventsCommand, type PutEventsRequestEntry } from '@aws-sdk/client-eventbridge';
import { FailureActionPlan, type FailureSignal } from '@domain/failure-intelligence';

export interface EventBridgeConfig {
  source: string;
  busName: string;
  detailType?: string;
}

const toEntry = (source: string, detailType: string, eventType: string, detail: object): PutEventsRequestEntry => ({
  EventBusName: source,
  Source: source,
  DetailType: detailType,
  Detail: JSON.stringify({ eventType, detail }),
  Resources: [],
});

export class FailureEventBridgeAdapter {
  constructor(private readonly client: EventBridgeClient, private readonly config: EventBridgeConfig) {}

  async publishSignal(signal: FailureSignal): Promise<void> {
    const command = new PutEventsCommand({
      Entries: [toEntry(this.config.busName, this.config.detailType ?? 'failure.signal.ingested', 'failure.signal.ingested', signal)],
    });
    await this.client.send(command);
  }

  async publishPlan(plan: FailureActionPlan): Promise<void> {
    const command = new PutEventsCommand({
      Entries: [toEntry(this.config.busName, this.config.detailType ?? 'failure.plan.generated', 'failure.plan.generated', plan)],
    });
    await this.client.send(command);
  }
}
