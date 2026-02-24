import type { FusionLabExecutionRequest } from './types';
import type { RecoveryAdapter } from './adapter';

export interface WorkspaceSeedInput {
  readonly tenant: string;
  readonly workspace: string;
  readonly requestedBy: string;
}

export interface WorkspaceSeed {
  readonly tenant: string;
  readonly workspace: string;
  readonly requestedBy: string;
  readonly accepted: true;
  readonly issuedAt: string;
}

export const createWorkspaceSeed = (input: WorkspaceSeedInput): WorkspaceSeed => ({
  ...input,
  accepted: true,
  issuedAt: new Date().toISOString(),
});

export const buildAdapterFrames = (adapters: readonly RecoveryAdapter[], request: FusionLabExecutionRequest): readonly string[] =>
  adapters.map((adapter) => `${adapter.id}:${request.workspaceId}:${request.context.tenant}`);

export const createTimelineDigest = (frames: readonly string[]): string =>
  frames
    .map((frame, index) => `${index}:${frame}`)
    .join('|');
