import { CloudWatchLogsClient, CreateLogGroupCommand, CreateLogStreamCommand, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { AwsClientOptions } from '@shared/aws-adapters';

export interface LogRecord {
  message: string;
  level: 'info' | 'warn' | 'error';
  timestamp: Date;
  spanId: string;
}

export interface LogConfig extends AwsClientOptions {
  groupName: string;
  streamName: string;
}

export class CloudWatchSink {
  private readonly client: CloudWatchLogsClient;

  constructor(private readonly config: LogConfig) {
    this.client = new CloudWatchLogsClient({ region: config.region, credentials: config.credentials, endpoint: config.endpoint });
  }

  async bootstrap(): Promise<void> {
    await this.client.send(new CreateLogGroupCommand({ logGroupName: this.config.groupName }));
    await this.client.send(new CreateLogStreamCommand({ logGroupName: this.config.groupName, logStreamName: this.config.streamName }));
  }

  async log(entry: LogRecord): Promise<void> {
    await this.client.send(new PutLogEventsCommand({
      logGroupName: this.config.groupName,
      logStreamName: this.config.streamName,
      logEvents: [
        {
          message: JSON.stringify(entry),
          timestamp: entry.timestamp.getTime(),
        },
      ],
    }));
  }

  async emitBatch(entries: readonly LogRecord[]): Promise<number> {
    await this.bootstrap();
    for (const e of entries) {
      await this.log(e);
    }
    return entries.length;
  }
}

