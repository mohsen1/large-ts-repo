import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { z } from 'zod';

const eventBridgeInputSchema = z.object({
  tenantId: z.string(),
  runId: z.string(),
  planName: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
});

export type EventBridgePayload = z.infer<typeof eventBridgeInputSchema>;

const eventClient = new EventBridgeClient({
  region: process.env.CASCADES_AWS_REGION ?? 'us-east-1',
  maxAttempts: 2,
});

export const publishEvents = async (payload: EventBridgePayload): Promise<void> => {
  const parsed = eventBridgeInputSchema.parse(payload);
  const hasBus = process.env.CASCADES_EVENT_BUS;

  if (!hasBus) {
    return;
  }

  const command = new PutEventsCommand({
    Entries: [
      {
        EventBusName: hasBus,
        Source: 'recovery.cascade',
        DetailType: 'cascade.run-complete',
        Detail: JSON.stringify(parsed),
      },
    ],
  });

  await eventClient.send(command);
};
