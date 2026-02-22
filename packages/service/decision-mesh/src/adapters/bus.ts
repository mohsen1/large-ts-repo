import type { MessageBus, TopicName } from '@platform/messaging';
import { createEnvelope } from '@shared/protocol';
import type { DecisionMeshResult } from '../types';

export interface MeshEventBus {
  publishStarted(message: { requestId: string; tenantId: string; policyId: string }): Promise<void>;
  publishCompleted(result: DecisionMeshResult): Promise<void>;
  publishFailed(requestId: string, reason: string): Promise<void>;
}

export interface BusAdapterOptions {
  startedTopic?: TopicName;
  completedTopic?: TopicName;
  failedTopic?: TopicName;
}

export class MessageBusAdapter implements MeshEventBus {
  private readonly startedTopic: TopicName;
  private readonly completedTopic: TopicName;
  private readonly failedTopic: TopicName;

  constructor(
    private readonly bus: MessageBus,
    options: BusAdapterOptions = {},
  ) {
    this.startedTopic = options.startedTopic ?? ('mesh.decisions.started' as TopicName);
    this.completedTopic = options.completedTopic ?? ('mesh.decisions.completed' as TopicName);
    this.failedTopic = options.failedTopic ?? ('mesh.decisions.failed' as TopicName);
  }

  async publishStarted(message: { requestId: string; tenantId: string; policyId: string }): Promise<void> {
    await this.bus.publish(this.startedTopic, createEnvelope('mesh.decision.started', message));
  }

  async publishCompleted(result: DecisionMeshResult): Promise<void> {
    await this.bus.publish(this.completedTopic, createEnvelope('mesh.decision.completed', result));
  }

  async publishFailed(requestId: string, reason: string): Promise<void> {
    await this.bus.publish(this.failedTopic, createEnvelope('mesh.decision.failed', { requestId, reason }));
  }
}
