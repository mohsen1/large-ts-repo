import { EventBridgeClient, PutEventsCommand, PutEventsCommandInput } from '@aws-sdk/client-eventbridge';
import type { ScenarioRunId, ScenarioId } from '@domain/recovery-scenario-design';

export interface EventBridgeAdapterConfig {
  readonly region: string;
  readonly source: string;
  readonly detailTypePrefix: string;
}

export interface ScenarioBridgeEvent {
  readonly runId: ScenarioRunId;
  readonly scenarioId: ScenarioId;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

export class ScenarioEventBridgeAdapter {
  readonly #client: EventBridgeClient;
  readonly #config: EventBridgeAdapterConfig;

  constructor(config: EventBridgeAdapterConfig) {
    this.#client = new EventBridgeClient({ region: config.region });
    this.#config = config;
  }

  async emit(event: ScenarioBridgeEvent): Promise<{ ok: boolean }> {
    const commandInput: PutEventsCommandInput = {
      Entries: [
        {
          Source: this.#config.source,
          DetailType: `${this.#config.detailTypePrefix}.${event.type}`,
          EventBusName: 'default',
          Detail: JSON.stringify(event.payload),
          Resources: [event.scenarioId, event.runId],
        },
      ],
    };

    await this.#client.send(new PutEventsCommand(commandInput));
    return { ok: true };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#client.destroy();
  }
}
