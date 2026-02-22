import { ScanCommand, PutItemCommand, GetItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { RecoveryGovernanceRepository } from './repository';
import type { PolicyHistoryRecord, PolicyStoreFilter, GovernanceStoreSnapshot } from './models';
import { parseHistoryFilter, parsePolicyHistory } from './schema';

interface RecoveryGovernanceDdbConfig {
  readonly tableName: string;
  readonly region?: string;
}

const primaryKeys = {
  tenantPrefix: 'tenant#',
  outcomePrefix: 'governance#',
};

export class RecoveryGovernanceDynamoRepository implements RecoveryGovernanceRepository {
  private readonly client: DynamoDBClient;

  constructor(private readonly config: RecoveryGovernanceDdbConfig) {
    this.client = new DynamoDBClient({ region: config.region ?? 'us-east-1' });
  }

  async upsertOutcome(outcome: PolicyHistoryRecord): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.config.tableName,
        Item: marshall({
          pk: `${primaryKeys.tenantPrefix}${outcome.tenant}`,
          sk: `${primaryKeys.outcomePrefix}${outcome.runId}`,
          type: 'governance-outcome',
          ...outcome,
        }),
      }),
    );
  }

  async findHistory(filter: PolicyStoreFilter): Promise<readonly PolicyHistoryRecord[]> {
    parseHistoryFilter(filter);
    const response = await this.client.send(new ScanCommand({ TableName: this.config.tableName }));
    const items = response.Items ?? [];
    return items
      .map((item) => unmarshall(item as Record<string, AttributeValue>))
      .filter((record: any) => record.type === 'governance-outcome')
      .map((record: any) => parsePolicyHistory(record));
  }

  async loadSnapshot(tenant: PolicyHistoryRecord['tenant']): Promise<GovernanceStoreSnapshot | undefined> {
    const response = await this.client.send(
      new GetItemCommand({
        TableName: this.config.tableName,
        Key: marshall({ pk: `${primaryKeys.tenantPrefix}${tenant}` }),
      }),
    );
    if (!response.Item) return undefined;
    const raw = parsePolicyHistory(unmarshall(response.Item as Record<string, AttributeValue>));
    return {
      tenant,
      lastRunId: raw.runId,
      records: [raw],
    };
  }
}
