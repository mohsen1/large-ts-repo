import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { ReadinessReadModel } from '@data/recovery-readiness-store/src/models';
import { targetCriticalityScoreFallback } from '@domain/recovery-readiness/src/policy';

export interface OrchestratorEvent {
  action: 'created' | 'updated' | 'activated';
  runId: string;
  payload: ReadinessReadModel['plan'];
}

export interface ReadinessNotifier {
  publish(event: OrchestratorEvent): Promise<void>;
}

export interface ReadinessQueue {
  enqueue(runId: string, namespace: string, payload: ReadinessReadModel): Promise<void>;
}

export class EventBridgeReadinessPublisher implements ReadinessNotifier {
  constructor(
    private readonly client: EventBridgeClient,
    private readonly source: string,
    private readonly busName: string,
  ) {}

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
        riskBand: event.payload.riskBand,
      }),
    };

    await this.client.send(new PutEventsCommand({ Entries: [eventPayload] }));
  }
}

export class SqsReadinessQueue implements ReadinessQueue {
  constructor(private readonly client: SQSClient, private readonly queueUrl: string) {}

  async enqueue(runId: string, namespace: string, payload: ReadinessReadModel): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageGroupId: namespace,
        MessageBody: JSON.stringify({
          runId,
          namespace,
          payload,
          sentAt: new Date().toISOString(),
        }),
      }),
    );
  }
}

function aggregateTargetCriticality(targets: ReadinessReadModel['plan']['targets']): number {
  return targets.reduce((sum, target) => sum + targetCriticalityScoreFallback(target), 0);
}
