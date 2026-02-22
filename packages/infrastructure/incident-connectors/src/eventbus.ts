import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { Result, ok, err } from '@shared/result';
import { AdaptiveDecision, AdaptiveRun, AdaptiveAction } from '@domain/adaptive-ops';

interface ConnectorInput {
  busName: string;
  region?: string;
}

export interface PublishOptions {
  detailType: string;
  source: string;
}

export interface IncidentConnector {
  publishDecision(decision: AdaptiveDecision, run: AdaptiveRun): Promise<Result<void, string>>;
  publishActions(actions: readonly AdaptiveAction[]): Promise<Result<void, string>>;
}

export interface EventPayload<T> {
  payload: T;
  emittedAt: string;
  source: string;
  detailType: string;
}

export class EventBridgeConnector implements IncidentConnector {
  constructor(private readonly client: EventBridgeClient, private readonly input: ConnectorInput) {}

  static create(input: ConnectorInput): EventBridgeConnector {
    return new EventBridgeConnector(new EventBridgeClient({ region: input.region ?? 'us-east-1' }), input);
  }

  async publishDecision(decision: AdaptiveDecision, run: AdaptiveRun): Promise<Result<void, string>> {
    const payload: EventPayload<{ decision: AdaptiveDecision; run: AdaptiveRun }> = {
      payload: { decision, run },
      emittedAt: new Date().toISOString(),
      source: 'adaptive-ops.engine',
      detailType: 'adaptive.decision.synthesized',
    };

    return this.publish(payload);
  }

  async publishActions(actions: readonly AdaptiveAction[]): Promise<Result<void, string>> {
    const payload: EventPayload<{ actions: readonly AdaptiveAction[] }> = {
      payload: { actions },
      emittedAt: new Date().toISOString(),
      source: 'adaptive-ops.engine',
      detailType: 'adaptive.actions.synthesized',
    };
    return this.publish(payload);
  }

  private async publish<T>(payload: EventPayload<T>): Promise<Result<void, string>> {
    try {
      await this.client.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: payload.source,
              DetailType: payload.detailType,
              Detail: JSON.stringify(payload),
              EventBusName: this.input.busName,
            },
          ]
        })
      );
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error.message : 'failed to publish event');
    }
  }
}
