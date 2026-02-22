import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';

export interface Item {
  pk: string;
  sk: string;
  payload: unknown;
  ttl?: number;
}

export interface StoreOptions {
  tableName: string;
}

export class DynamoStore {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly options: StoreOptions) {}

  private key(pk: string, sk: string) {
    return { pk, sk };
  }

  async save(item: Item): Promise<void> {
    const command = new PutCommand({
      TableName: this.options.tableName,
      Item: { ...item },
    });
    await this.client.send(command);
  }

  async load(pk: string, sk: string): Promise<Item | null> {
    const command = new GetCommand({
      TableName: this.options.tableName,
      Key: this.key(pk, sk),
    });
    const result = await this.client.send(command);
    return (result.Item as Item) ?? null;
  }

  async queryByPk(pk: string): Promise<Item[]> {
    const command = new QueryCommand({
      TableName: this.options.tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': pk },
    });
    const result = await this.client.send(command);
    return (result.Items as Item[]) ?? [];
  }

  async remove(pk: string, sk: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: this.options.tableName,
      Key: this.key(pk, sk),
    });
    await this.client.send(command);
  }
}
