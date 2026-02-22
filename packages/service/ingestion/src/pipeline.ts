import { EventEnvelope, IngestionBatch } from './schemas';
import { ServiceBus } from '@platform/queue';
import { MemoryWarehouse, Query } from '@data/warehouse';
import { EventWatcher } from '@infrastructure/aws-ops';

export interface IngestionConfig {
  batchSize: number;
  parallelism: number;
}

export interface IngestResult {
  accepted: number;
  dropped: number;
  warnings: string[];
}

interface Transform {
  apply(event: EventEnvelope): Promise<EventEnvelope | null>;
}

class AddMetadata implements Transform {
  async apply(event: EventEnvelope): Promise<EventEnvelope> {
    return {
      ...event,
      payload: {
        ...(typeof event.payload === 'object' && event.payload !== null ? (event.payload as Record<string, unknown>) : {}),
        ingestedAt: new Date().toISOString(),
      },
    };
  }
}

class ValidateKind implements Transform {
  async apply(event: EventEnvelope): Promise<EventEnvelope | null> {
    if (!event.type || !event.id) return null;
    return event;
  }
}

class NormalizeTenant implements Transform {
  async apply(event: EventEnvelope): Promise<EventEnvelope> {
    return {
      ...event,
      tenantId: event.tenantId.toLowerCase(),
    };
  }
}

export class IngestionPipeline {
  private readonly transforms: Transform[] = [new AddMetadata(), new ValidateKind(), new NormalizeTenant()];

  constructor(
    private readonly bus: ServiceBus<EventEnvelope>,
    private readonly config: IngestionConfig,
    private readonly watcher?: EventWatcher,
  ) {}

  async ingest(batch: IngestionBatch): Promise<IngestResult> {
    const result: IngestResult = { accepted: 0, dropped: 0, warnings: [] };
    const chunks = chunk(batch.events, this.config.batchSize);
    for (const chunked of chunks) {
      await Promise.all(
        chunked.map(async (input) => {
          const normalized = await this.normalize(input);
          if (!normalized) {
            result.dropped += 1;
            return;
          }
          await this.bus.publish(normalized);
          if (this.watcher) {
            await this.watcher.invoke(normalized);
          }
          result.accepted += 1;
        }),
      );
    }
    return result;
  }

  private async normalize(event: EventEnvelope): Promise<EventEnvelope | null> {
    let value: EventEnvelope | null = event;
    for (const transform of this.transforms) {
      value = await transform.apply(value);
      if (!value) return null;
    }
    return value;
  }
}

function chunk<T>(input: readonly T[], size: number): T[][] {
  const sizeOrOne = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < input.length; i += sizeOrOne) {
    out.push([...input.slice(i, i + sizeOrOne)]);
  }
  return out;
}

export async function bootstrap(): Promise<IngestResult> {
  const bus = new ServiceBus<EventEnvelope>();
  const pipeline = new IngestionPipeline(bus, { batchSize: 25, parallelism: 2 });
  const sample: IngestionBatch = {
    id: 'batch-1',
    receivedAt: new Date().toISOString(),
    events: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        source: 'test',
        type: 'user.created',
        payload: { userId: 'u1' },
        occurredAt: new Date().toISOString(),
        tenantId: 'acme',
      },
    ],
  };
  return pipeline.ingest(sample);
}
