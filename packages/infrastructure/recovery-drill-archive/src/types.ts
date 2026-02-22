import type { RecoveryDrillTenantId, RecoveryDrillRunSummary } from '@domain/recovery-drill-telemetry';

export interface DrillArchiveManifest {
  readonly tenant: RecoveryDrillTenantId;
  readonly runId: string;
  readonly bucket: string;
  readonly objectKey: string;
  readonly createdAt: string;
}

export interface ArchiveWriteOptions {
  readonly bucket: string;
  readonly runPrefix?: string;
  readonly region?: string;
  readonly endpoint?: string;
}

export interface ArchivedResult {
  readonly manifest: DrillArchiveManifest;
  readonly etag: string;
  readonly bytes: number;
}

export interface ArchiveOutput extends RunSummaryPublished {
  readonly archived: boolean;
}

export interface RunSummaryPublished {
  readonly summary: RecoveryDrillRunSummary;
  readonly topicArn?: string;
  readonly route: 's3' | 'sns' | 'none';
}
