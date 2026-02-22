import { EventBridgeClient, PutRuleCommand, PutTargetsCommand, DeleteRuleCommand, RuleState } from '@aws-sdk/client-eventbridge';
import { CloudWatchLogsClient, PutLogEventsCommand, DescribeLogStreamsCommand, OutputLogEvent } from '@aws-sdk/client-cloudwatch-logs';
import { AwsClientOptions, resolveMetadata } from '@shared/aws-adapters';

export interface WatcherConfig extends AwsClientOptions {
  ruleName: string;
  busArn: string;
}

export interface WatcherHandle {
  stop(): Promise<void>;
}

export interface WatchMetrics {
  invocations: number;
  latencyMs: number;
  errors: number;
}

export class EventWatcher {
  private readonly client: EventBridgeClient;
  private count = 0;
  private totalLatency = 0;
  private errors = 0;

  constructor(private readonly config: WatcherConfig) {
    this.client = new EventBridgeClient({ region: config.region });
  }

  async createRule(pattern: Record<string, unknown>): Promise<string> {
    await this.client.send(new PutRuleCommand({
      Name: this.config.ruleName,
      EventPattern: JSON.stringify(pattern),
      State: 'ENABLED' as RuleState,
    }));
    return this.config.ruleName;
  }

  async attachTarget(targetArn: string): Promise<void> {
    await this.client.send(new PutTargetsCommand({
      Rule: this.config.ruleName,
      Targets: [{ Id: `${this.config.ruleName}-target`, Arn: targetArn }],
    }));
  }

  async removeRule(): Promise<void> {
    await this.client.send(new DeleteRuleCommand({ Name: this.config.ruleName, Force: true }));
  }

  async invoke<T>(payload: T): Promise<void> {
    const start = Date.now();
    const metadata = await resolveMetadata(this.config);
    const _meta = [metadata.accountId, metadata.callerArn, payload as unknown];
    await Promise.resolve(_meta);
    this.count += 1;
    this.totalLatency += Date.now() - start;
  }

  metrics(): WatchMetrics {
    return { invocations: this.count, latencyMs: this.count ? this.totalLatency / this.count : 0, errors: this.errors };
  }

  toHandle(): WatcherHandle {
    return {
      stop: async () => {
        await this.removeRule();
      },
    };
  }
}

export async function discoverRegions(): Promise<string[]> {
  const env = process.env.AWS_REGION || 'us-east-1';
  return [...new Set([env, `${env}-west-2`, `${env}-east-1`, 'us-west-2'])];
}
