export type QueueMessageId = string & { readonly __brand: 'queue-message-id' };
export type SubscriptionId = string & { readonly __brand: 'subscription-id' };

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  jitter: number;
}

export interface EnqueueOptions {
  dedupeKey?: string;
  visibilityTimeoutMs?: number;
  priority?: number;
}

export interface Delivery<T> {
  id: QueueMessageId;
  payload: T;
  retryCount: number;
  attributes: Record<string, string>;
}

export interface QueueMetrics {
  seen: number;
  inFlight: number;
  deadLettered: number;
  averageProcessMs: number;
}

export interface QueueDriver<T> {
  publish(message: T, options?: EnqueueOptions): Promise<QueueMessageId>;
  subscribe(handler: (delivery: Delivery<T>) => Promise<void>): Promise<SubscriptionId>;
  close(): Promise<void>;
  metrics(): Promise<QueueMetrics>;
}
