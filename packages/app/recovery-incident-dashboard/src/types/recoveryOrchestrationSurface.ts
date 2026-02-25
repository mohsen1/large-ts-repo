import type {
  SurfaceContextSchema,
  SurfaceManifestSummary,
  SurfaceSignalEnvelope,
  SurfaceWorkspaceId,
} from '@shared/recovery-orchestration-surface';

export type SurfaceStatus = 'idle' | 'warming' | 'running' | 'ready' | 'error';

export interface SurfaceWorkspaceDescriptor {
  readonly workspaceId: SurfaceWorkspaceId;
  readonly tenant: string;
  readonly domain: string;
  readonly zone: string;
  readonly status: SurfaceStatus;
  readonly createdAt: number;
}

export type SurfaceWorkspaceMap<TValue> = {
  readonly [id: string]: TValue;
};

export type SurfaceSummary = Omit<SurfaceManifestSummary, 'remappedInputs' | 'remappedOutputs'> & {
  readonly workspace: SurfaceWorkspaceDescriptor;
  readonly pluginCountByKind: Record<'ingest' | 'synthesize' | 'simulate' | 'score' | 'actuate', number>;
  readonly pluginKinds: readonly string[];
  readonly tags?: readonly string[];
};

export type SurfaceWorkspaceEvent =
  | { readonly kind: 'boot' ; readonly workspace: SurfaceWorkspaceDescriptor }
  | { readonly kind: 'run'; readonly workspaceId: SurfaceWorkspaceId; readonly score: number; readonly records: number }
  | { readonly kind: 'error'; readonly message: string };

export interface SurfaceWorkspaceState {
  readonly workspace: SurfaceWorkspaceDescriptor;
  readonly context: SurfaceContextSchema;
  readonly records: readonly { readonly pluginId: string; readonly ok: boolean; readonly latency: number }[];
  readonly signals: readonly SurfaceSignalEnvelope[];
  readonly tags: readonly string[];
}

export const isSurfaceStatus = (value: string): value is SurfaceStatus =>
  value === 'idle' || value === 'warming' || value === 'running' || value === 'ready' || value === 'error';

export const describeSurfaceState = ({ tenant, domain, status }: SurfaceWorkspaceDescriptor): string =>
  `${tenant}/${domain}::${status}`;

export const toTaggedSummary = <TSummary extends SurfaceSummary>(summary: TSummary): SurfaceSummary & {
  readonly tags: readonly string[];
} => ({
  ...summary,
  tags: [
    `tenant:${summary.workspace.tenant}`,
    `domain:${summary.workspace.domain}`,
    `plugins:${summary.pluginCount}`,
  ],
});
