import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RecoverySuggestion } from '@data/recovery-observability';

export interface NotifierContext {
  readonly runState: RecoveryRunState;
  readonly suggestion?: RecoverySuggestion;
}

export interface ChannelHealth {
  readonly ok: boolean;
  readonly reason?: string;
}

export interface RecoveryChannel {
  publish(context: NotifierContext): Promise<Result<ChannelHealth, Error>>;
}

export class SnsRecoveryChannel implements RecoveryChannel {
  constructor(
    private readonly topicArn: string,
    private readonly client: SNSClient,
  ) {}

  async publish(context: NotifierContext): Promise<Result<ChannelHealth, Error>> {
    if (!this.topicArn) return fail(new Error('sns-topic-missing'));
    try {
      const command = new PublishCommand({
        TopicArn: this.topicArn,
        Message: JSON.stringify({
          runId: context.runState.runId,
          status: context.runState.status,
          suggestion: context.suggestion?.reason,
          action: context.suggestion?.actions.join(','),
          timestamp: new Date().toISOString(),
        }),
        Subject: `recovery-run-${context.runState.runId}`,
      });
      await this.client.send(command);
      return ok({ ok: true });
    } catch (error) {
      return fail(error as Error);
    }
  }
}
