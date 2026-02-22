import { QueueDriver, QueueMessageId, Delivery, EnqueueOptions, QueueMetrics, SubscriptionId } from './types';
import { MemoryQueue } from './memory';

export class ServiceBus<T> {
  private readonly driver: QueueDriver<T>;
  constructor() {
    this.driver = new MemoryQueue<T>({ maxAttempts: 3, backoffMs: 10, jitter: 0.1 });
  }

  async publish(message: T, options?: EnqueueOptions): Promise<QueueMessageId> {
    return this.driver.publish(message, options);
  }

  async onMessage(handler: (delivery: Delivery<T>) => Promise<void>): Promise<SubscriptionId> {
    return this.driver.subscribe(handler);
  }

  async metrics(): Promise<QueueMetrics> {
    return this.driver.metrics();
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
