import type { ReadinessReadModel, PersistedArtifact, StoreSnapshot } from './models';
import { readModelSchema, snapshotSchema } from './schema';
import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface ReadinessPersistenceAdapter {
  persist(model: ReadinessReadModel): Promise<PersistedArtifact>;
  load(runId: string): Promise<ReadinessReadModel | undefined>;
  loadSnapshot(key: string): Promise<PersistedArtifact | undefined>;
}

export class S3ReadinessAdapter implements ReadinessPersistenceAdapter {
  constructor(private readonly client: S3Client, private readonly bucket: string) {}

  async persist(model: ReadinessReadModel): Promise<PersistedArtifact> {
    const schema = readModelSchema.parse(model);
    const path = `readiness/${model.plan.runId}/${Date.now()}.json`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: JSON.stringify(schema),
        ContentType: 'application/json'
      })
    );

    return {
      namespace: 'drift-currents',
      runId: model.plan.runId,
      sha256: `sha256:${path}`,
      payloadPath: path,
      schemaVersion: 1
    };
  }

  async load(runId: string): Promise<ReadinessReadModel | undefined> {
    const key = `readiness/${runId}/latest.json`;
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));

    if (!response.Body) {
      return undefined;
    }

    const bytes = await response.Body.transformToString();
    const parsed = readModelSchema.parse(JSON.parse(bytes));
    return parsed;
  }

  async loadSnapshot(key: string): Promise<PersistedArtifact | undefined> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!response.Body) {
      return undefined;
    }

    const bytes = await response.Body.transformToString();
    const parsed = snapshotSchema.parse(JSON.parse(bytes));
    return parsed;
  }
}

export function artifactStats(snapshot: PersistedArtifact | undefined): StoreSnapshot {
  if (!snapshot) {
    return {
      createdRuns: 0,
      updatedRuns: 0,
      failedWrites: 0,
      totalSignals: 0
    };
  }

  return {
    createdRuns: 1,
    updatedRuns: 0,
    failedWrites: 0,
    totalSignals: Number.parseInt(snapshot.schemaVersion.toString(), 10)
  };
}
