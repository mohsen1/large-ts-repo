import { DynamoDBClient, ScanCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

import type { RecoveryOperationsRepository } from './repository';
import type { RunSession, RunPlanSnapshot } from '@domain/recovery-operations-models';
import { parseSessionRecord, parseFilter } from './schema';

interface RecoveryOperationsDdbConfig {
  readonly tableName: string;
  readonly region?: string;
}

interface CommandResult<T> {
  readonly value?: T;
}

export class RecoveryOperationsDynamoRepository implements RecoveryOperationsRepository {
  private readonly client: DynamoDBClient;

  constructor(private readonly config: RecoveryOperationsDdbConfig) {
    this.client = new DynamoDBClient({ region: config.region ?? 'us-east-1' });
  }

  async upsertSession(session: RunSession): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.config.tableName,
        Item: marshall(this.toDdbSession(session)),
      }),
    );
  }

  async upsertPlan(plan: RunPlanSnapshot): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.config.tableName,
        Item: marshall({
          pk: `plan#${plan.id}`,
          type: 'plan',
          ...plan,
        }),
      }),
    );
  }

  async upsertDecision(decision: any): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.config.tableName,
        Item: marshall({
          pk: `decision#${decision.ticketId}`,
          type: 'decision',
          payload: decision,
        }),
      }),
    );
  }

  async loadSessionByRunId(runId: string): Promise<RunSession | undefined> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.config.tableName,
        Key: marshall({ pk: `session#${runId}` }),
      }),
    );

    if (!result.Item) return undefined;
    return parseSessionRecord(unmarshall(result.Item as Record<string, NativeAttributeValue>)) as RunSession;
  }

  async findLifecycle(filter: Parameters<RecoveryOperationsRepository['findLifecycle']>[0]): Promise<readonly any[]> {
    parseFilter(filter);
    const response = await this.client.send(new ScanCommand({ TableName: this.config.tableName }));
    return (response.Items ?? []).map((item) => unmarshall(item as Record<string, NativeAttributeValue>));
  }

  async loadLatestSnapshot(tenant: string): Promise<any> {
    const response = await this.client.send(new ScanCommand({ TableName: this.config.tableName }));
    const firstSession = (response.Items ?? [])[0]
      ? (unmarshall(response.Items[0] as Record<string, NativeAttributeValue>) as any)
      : undefined;

    if (!firstSession) return undefined;
    return {
      tenant,
      planId: `${tenant}:plan`,
      sessions: [firstSession],
    };
  }

  private toDdbSession(session: RunSession): Record<string, NativeAttributeValue> {
    return {
      pk: `session#${session.runId}`,
      type: 'session',
      ...session,
      updatedAt: session.updatedAt,
    };
  }
}

export type { RecoveryOperationsDdbConfig };
