import type { StudioWorkspaceState } from './registry';

export interface StudioInput {
  tenant: string;
  workspace: string;
  scenarioId: string;
  pluginFilter?: readonly string[];
  includeTelemetry?: boolean;
}

export interface WorkspaceCommand {
  workspace: string;
  command: 'start' | 'pause' | 'abort' | 'resume';
  requestedBy?: string;
}

export interface StudioManifest {
  id: string;
  tenant: string;
  workspace: string;
  runAt: string;
  lanes: readonly string[];
}

export interface StudioSnapshot {
  tenant: string;
  workspace: string;
  runId: string;
  score: number;
  pluginTraces: readonly { plugin: string; stage: string; startedAt: string; ms: number; ok: boolean }[];
}

export const parseWorkspaceInput = (raw: unknown): StudioInput => {
  const value = raw as Partial<StudioInput>;
  return {
    tenant: String(value.tenant ?? 'tenant-default'),
    workspace: String(value.workspace ?? 'workspace-default'),
    scenarioId: String(value.scenarioId ?? 'scenario-default'),
    pluginFilter: value.pluginFilter?.filter((entry): entry is string => typeof entry === 'string'),
    includeTelemetry: value.includeTelemetry ?? true,
  };
};

export const parseWorkspaceCommand = (raw: unknown): WorkspaceCommand => {
  const value = raw as Partial<WorkspaceCommand>;
  const command = String(value.command ?? 'start');
  const safe = command === 'pause' || command === 'abort' || command === 'resume' ? command : 'start';
  return {
    workspace: String(value.workspace ?? 'workspace-default'),
    command: safe,
    requestedBy: value.requestedBy,
  };
};

export const parseManifest = (raw: unknown): StudioManifest => {
  const value = raw as Partial<StudioManifest>;
  return {
    id: String(value.id ?? 'manifest:default'),
    tenant: String(value.tenant ?? 'tenant-default'),
    workspace: String(value.workspace ?? 'workspace-default'),
    runAt: String(value.runAt ?? new Date().toISOString()),
    lanes: value.lanes?.filter((entry): entry is string => typeof entry === 'string') ?? [],
  };
};

export const parseSnapshot = (raw: unknown): StudioSnapshot => {
  const value = raw as Partial<StudioSnapshot>;
  return {
    tenant: String(value.tenant ?? 'tenant-default'),
    workspace: String(value.workspace ?? 'workspace-default'),
    runId: String(value.runId ?? 'run-default'),
    score: Number.isFinite(value.score ?? 0) ? Number(value.score) : 0,
    pluginTraces: [],
  };
};

export const defaults = {
  includeTelemetry: true,
  command: 'start' as const,
};

export const toWorkspaceState = (input: StudioInput): StudioWorkspaceState => ({
  workspace: input.workspace,
  pluginFilter: input.pluginFilter,
  selectedScenario: input.scenarioId,
  includeTelemetry: input.includeTelemetry ?? true,
});
