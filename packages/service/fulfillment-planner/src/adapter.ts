import { FulfillmentExecution } from '@domain/fulfillment-orchestration';
import { toEnvelope } from '@data/fulfillment-hub';
import { InMemoryFulfillmentHubStore } from '@data/fulfillment-hub';
import { Result, fail, ok } from '@shared/result';

export interface Publisher {
  publish<T>(topic: string, payload: T): Promise<Result<void>>;
}

export class ConsolePublisher implements Publisher {
  async publish<T>(topic: string, payload: T): Promise<Result<void>> {
    if (!topic) return fail(new Error('missing topic'));
    console.info(topic, JSON.stringify(payload));
    return ok(undefined);
  }
}

export const publishExecution = async (
  publisher: Publisher,
  execution: FulfillmentExecution,
): Promise<Result<void>> => {
  const envelope = toEnvelope('fulfillment.run.updated', {
    run: execution,
    details: `run ${execution.runId} moved to ${execution.status}`,
  });

  return publisher.publish('fulfillment.execution', envelope);
};

export class HubBackedAdapter {
  constructor(private readonly store: InMemoryFulfillmentHubStore, private readonly publisher: Publisher) {}

  async publishRun(run: FulfillmentExecution): Promise<Result<void>> {
    const saved = await this.store.saveRun(run);
    if (!saved.ok) return fail(saved.error);
    return publishExecution(this.publisher, run);
  }
}
