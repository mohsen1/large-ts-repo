import { QueueDriver, QueueMessageId, Delivery, RetryPolicy, EnqueueOptions, QueueMetrics, SubscriptionId } from './types';

interface InternalMessage<T> {
  id: QueueMessageId;
  payload: T;
  retryCount: number;
}

export class MemoryQueue<T> implements QueueDriver<T> {
  private readonly items: InternalMessage<T>[] = [];
  private readonly retryPolicy: RetryPolicy;
  private handlers: Array<(delivery: Delivery<T>) => Promise<void>> = [];
  private seen = 0;
  private processedMsTotal = 0;

  constructor(retryPolicy?: Partial<RetryPolicy>) {
    this.retryPolicy = {
      maxAttempts: retryPolicy?.maxAttempts ?? 5,
      backoffMs: retryPolicy?.backoffMs ?? 100,
      jitter: retryPolicy?.jitter ?? 0.2,
    };
  }

  async publish(message: T, options?: EnqueueOptions): Promise<QueueMessageId> {
    const id = `${Date.now()}-${this.items.length}-${options?.dedupeKey ?? Math.random()}` as QueueMessageId;
    this.items.push({ id, payload: message, retryCount: 0 });
    this.seen += 1;
    await this.deliver();
    return id;
  }

  subscribe(handler: (delivery: Delivery<T>) => Promise<void>): Promise<SubscriptionId> {
    this.handlers.push(handler);
    return Promise.resolve(`sub-${this.handlers.length}` as SubscriptionId);
  }

  async close(): Promise<void> {
    this.handlers = [];
  }

  async metrics(): Promise<QueueMetrics> {
    return {
      seen: this.seen,
      inFlight: this.items.length,
      deadLettered: Math.max(0, this.seen - this.items.length),
      averageProcessMs: this.seen > 0 ? this.processedMsTotal / this.seen : 0,
    };
  }

  private async deliver(): Promise<void> {
    while (this.items.length > 0) {
      const item = this.items.shift();
      if (!item) return;

      for (const handler of this.handlers) {
        const start = Date.now();
        try {
          await handler({ id: item.id, payload: item.payload, retryCount: item.retryCount, attributes: {} });
        } catch (error) {
          item.retryCount += 1;
          if (item.retryCount < this.retryPolicy.maxAttempts) {
            await sleep(this.retryPolicy.backoffMs + jittered(this.retryPolicy.backoffMs, this.retryPolicy.jitter));
            this.items.push(item);
          }
        } finally {
          this.processedMsTotal += Date.now() - start;
        }
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jittered(base: number, ratio: number): number {
  const jitter = base * ratio;
  return Math.floor((Math.random() * jitter * 2) - jitter);
}
