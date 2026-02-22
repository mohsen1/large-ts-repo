import { SNSClient, PublishCommand, PublishCommandInput } from '@aws-sdk/client-sns';
import type { ScenarioEnvelope } from '@domain/recovery-scenario-engine';

export interface AdapterConfig {
  region: string;
  topicArn?: string;
  enabled: boolean;
}

export class ScenarioAdapter {
  #client: SNSClient;
  #config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.#client = new SNSClient({ region: config.region });
    this.#config = config;
  }

  async publishDecision(envelope: ScenarioEnvelope): Promise<string | undefined> {
    if (!this.#config.enabled || !this.#config.topicArn) return undefined;
    const payload = JSON.stringify({
      scenarioId: envelope.scenario.id,
      runId: envelope.run.runId,
      confidence: envelope.decision.confidence,
      actionCodes: envelope.run.actionCodes,
      metrics: envelope.metrics,
    });

    const input: PublishCommandInput = {
      TopicArn: this.#config.topicArn,
      Message: payload,
      MessageAttributes: {
        scenarioId: {
          DataType: 'String',
          StringValue: envelope.scenario.id,
        },
      },
    };

    const command = new PublishCommand(input);
    const out = await this.#client.send(command);
    return out.MessageId;
  }

  async publishBatch(envelopes: readonly ScenarioEnvelope[]): Promise<readonly string[]> {
    const ids: string[] = [];
    for (const envelope of envelopes) {
      const id = await this.publishDecision(envelope);
      if (id) ids.push(id);
    }
    return ids;
  }
}

export const makeAdapter = (region: string, topicArn?: string): ScenarioAdapter =>
  new ScenarioAdapter({ region, topicArn, enabled: Boolean(topicArn) });
