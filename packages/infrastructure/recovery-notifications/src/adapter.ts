import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';

import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { Envelope } from '@shared/protocol';

export interface RecoveryNotifier {
  publishRunState(runState: RecoveryRunState): Promise<Result<void, Error>>;
  publishCheckpointUpdate(payload: Envelope<unknown>): Promise<Result<void, Error>>;
}

const isHealthyStatus = (status: RecoveryRunState['status']) =>
  status === 'completed';

export class EventBridgeRecoveryNotifier implements RecoveryNotifier {
  constructor(
    private readonly eventBus: string,
    private readonly client: EventBridgeClient
  ) {}

  async publishRunState(runState: RecoveryRunState): Promise<Result<void, Error>> {
    if (!this.eventBus) return fail(new Error('event-bus-missing'));
    try {
      const command = new PutEventsCommand({
        Entries: [
          {
            DetailType: 'recovery-run-state',
            Detail: JSON.stringify(runState),
            EventBusName: this.eventBus,
            Source: 'recovery-orchestrator',
            Time: new Date(),
          },
        ],
      });
      await this.client.send(command);
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async publishCheckpointUpdate(payload: Envelope<unknown>): Promise<Result<void, Error>> {
    try {
      const command = new PutEventsCommand({
        Entries: [
          {
            DetailType: 'recovery-checkpoint',
            Detail: JSON.stringify({
              ...payload,
              healthy: isHealthyStatus((payload.payload as any)?.status ?? 'failed'),
            }),
            EventBusName: this.eventBus,
            Source: 'recovery-notifier',
            Time: new Date(),
          },
        ],
      });
      await this.client.send(command);
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }
}

export class NoopRecoveryNotifier implements RecoveryNotifier {
  async publishRunState(): Promise<Result<void, Error>> {
    return ok(undefined);
  }

  async publishCheckpointUpdate(): Promise<Result<void, Error>> {
    return ok(undefined);
  }
}
