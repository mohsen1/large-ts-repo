import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { ReadinessReadModel } from '@data/recovery-readiness-store/src/models';
import { targetCriticalityScoreFallback } from '@domain/recovery-readiness/src/policy';

export interface OrchestratorEvent {
  action: 'created' | 'updated' | 'activated';
  runId: string;
  payload: ReadinessReadModel['plan'];
}

export class EventBridgeReadinessPublisher {
  constructor(private readonly client: EventBridgeClient, private readonly source: string, private readonly busName: string) {}

  async publish(event: OrchestratorEvent): Promise<void> {
    const eventPayload = {
      Source: this.source,
      DetailType: `recovery-readiness:${event.action}`,
      EventBusName: this.busName,
      Detail: JSON.stringify({
        action: event.action,
        runId: event.runId,
        totalTargets: event.payload.targets.length,
        aggregateCriticality: aggregateTargetCriticality(event.payload.targets),
        riskBand: event.payload.riskBand
      })
    };

    await this.client.send(new PutEventsCommand({ Entries: [eventPayload] }));
  }
}

function aggregateTargetCriticality(targets: ReadinessReadModel['plan']['targets']): number {
  return targets.reduce((sum, target) => sum + targetCriticalityScoreFallback(target), 0);
}
