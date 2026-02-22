import { Brand } from '@shared/core';
import { Envelope } from '@shared/protocol';

export type TopicName = Brand<string, 'TopicName'>;
export type ConsumerGroup = Brand<string, 'ConsumerGroup'>;

export interface TopicHandle {
  topic: TopicName;
  group?: ConsumerGroup;
  close(): Promise<void>;
}

export interface SubscribeOptions {
  topic: TopicName;
  group?: ConsumerGroup;
  maxInFlight?: number;
}

export interface MessageBus {
  publish<T>(topic: TopicName, envelope: Envelope<T>): Promise<void>;
  subscribe<T>(options: SubscribeOptions, handler: (envelope: Envelope<T>) => Promise<void>): Promise<TopicHandle>;
}

export class InMemoryTopic {
  private handlers = new Set<(payload: unknown) => Promise<void>>();

  on<T>(handler: (envelope: Envelope<T>) => Promise<void>) {
    this.handlers.add(handler as (payload: unknown) => Promise<void>);
  }

  off<T>(handler: (envelope: Envelope<T>) => Promise<void>) {
    this.handlers.delete(handler as (payload: unknown) => Promise<void>);
  }

  async emit<T>(envelope: Envelope<T>): Promise<void> {
    for (const handler of Array.from(this.handlers)) {
      await handler(envelope as Envelope<unknown>);
    }
  }
}
