import { createEnvelope } from '@shared/protocol';
import { MessageBus } from '@platform/messaging';

export interface WorkerOptions {
  bus: MessageBus;
}

export const startWorker = async ({ bus }: WorkerOptions): Promise<void> => {
  const handler = async (raw: unknown) => {
    const payload = raw as { eventType: string; payload?: unknown };
    const envelope = createEnvelope('worker.received', {
      source: payload.eventType,
      payload,
      handledAt: new Date().toISOString(),
    });
    await bus.publish('worker.events' as any, envelope as any);
  };

  await bus.subscribe({ topic: 'checkout.events' as any }, async (envelope: any) => {
    await handler(envelope.payload);
  });

  await bus.subscribe({ topic: 'cli.events' as any }, async (envelope: any) => {
    await handler(envelope.payload);
  });
};
