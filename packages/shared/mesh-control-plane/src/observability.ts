import { S3Client, PutObjectCommand, type S3ClientConfig } from '@aws-sdk/client-s3';
import type { MeshRuntimeEvent } from '@shared/orchestration-lab-core';
import { buildMeshFingerprint } from '@shared/orchestration-lab-core';
import type { ControlPlaneStreamId, ControlPlaneRunId, ControlPlaneLane, ControlPlaneMode } from './types';

type NoInfer<T> = [T][T extends unknown ? 0 : never];

const defaultRegion = process.env.MESH_CONTROL_AWS_REGION ?? 'us-east-1';
const defaultClient = new S3Client({ region: defaultRegion } as NoInfer<S3ClientConfig>);

export interface MeshControlPlaneArtifact<TPayload = unknown> {
  readonly runId: ControlPlaneRunId;
  readonly tenantId: string;
  readonly lane: ControlPlaneLane;
  readonly mode: ControlPlaneMode;
  readonly streamId: ControlPlaneStreamId;
  readonly payload: TPayload;
}

export interface MeshControlPlaneArtifactSink {
  readonly name: string;
  putArtifact: (artifact: MeshControlPlaneArtifact<readonly MeshRuntimeEvent[]>) => Promise<string>;
}

export interface MeshControlPlanePublishResult {
  readonly ok: boolean;
  readonly key?: string;
  readonly error?: string;
}

export const defaultArtifactSink = (bucket: string, prefix = 'control-plane'): MeshControlPlaneArtifactSink => ({
  name: `s3://${bucket}/${prefix}`,
  async putArtifact(artifact) {
    const key = `${prefix}/${artifact.tenantId}/${artifact.runId}/${artifact.streamId}.json`;
    const payload = JSON.stringify(artifact);
    await defaultClient.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: payload,
        ContentType: 'application/json',
      }),
    );
    return key;
  },
});

export const publishArtifact = async (
  sink: MeshControlPlaneArtifactSink,
  events: readonly MeshRuntimeEvent[],
  runId: ControlPlaneRunId,
  tenantId: string,
  lane: ControlPlaneLane,
  mode: ControlPlaneMode,
): Promise<MeshControlPlanePublishResult> => {
  const streamId = buildMeshFingerprint([runId, tenantId, lane, mode]) as ControlPlaneStreamId;
  const artifact: MeshControlPlaneArtifact<readonly MeshRuntimeEvent[]> = {
    runId,
    tenantId,
    lane,
    mode,
    streamId,
    payload: events,
  };

  try {
    const key = await sink.putArtifact(artifact);
    return {
      ok: true,
      key,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
