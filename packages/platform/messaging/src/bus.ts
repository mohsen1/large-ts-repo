import { Envelope } from '@shared/protocol';
import { MessageBus, SubscribeOptions, TopicHandle, TopicName } from './topic';
import { InMemoryTopic } from './topic';
import { EventEmitter } from 'node:events';

export type InMemoryOptions = {
  maxListeners?: number;
};

export class InMemoryBus implements MessageBus {
  private readonly topics = new Map<string, InMemoryTopic>();
  private readonly emitter = new EventEmitter();

  constructor(private readonly options: InMemoryOptions = {}) {
    const max = this.options.maxListeners;
    if (typeof max === 'number') {
      this.emitter.setMaxListeners(max);
    }
  }

  async publish<T>(topic: TopicName, envelope: Envelope<T>): Promise<void> {
    const topicName = String(topic);
    const instance = this.topics.get(topicName) ?? this.createTopic(topicName);
    await instance.emit(envelope);
  }

  async subscribe<T>(options: SubscribeOptions, handler: (envelope: Envelope<T>) => Promise<void>): Promise<TopicHandle> {
    const topicName = String(options.topic);
    const instance = this.topics.get(topicName) ?? this.createTopic(topicName);
    const wrapped = (value: Envelope<T>) => handler(value);
    instance.on(wrapped);

    return {
      topic: options.topic,
      group: options.group,
      close: async () => {
        instance.off(wrapped);
      },
    };
  }

  private createTopic(topicName: string): InMemoryTopic {
    const created = new InMemoryTopic();
    this.topics.set(topicName, created);
    this.emitter.on(topicName, (payload) => created.emit(payload as any));
    return created;
  }
}
