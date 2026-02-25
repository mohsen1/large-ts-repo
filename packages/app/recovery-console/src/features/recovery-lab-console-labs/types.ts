import type { ControlLabTimeline, LabRunId } from '@domain/recovery-lab-console-labs';

export type OrchestrationMode = 'observe' | 'simulate' | 'simulate+policy' | 'audit-only';
export type ExecutionState = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
export type SeverityBand = 'critical' | 'high' | 'medium' | 'low';

export interface LabPluginCard {
  readonly pluginName: string;
  readonly pluginKind: string;
  readonly category: string;
  readonly domain: string;
  readonly stage: string;
  readonly dependencyCount: number;
}

export interface LabTimelineBucket {
  readonly runId: LabRunId;
  readonly kind: string;
  readonly startedAt: string;
  readonly diagnostics: readonly string[];
}

export interface PluginRuntimeRow {
  readonly pluginName: string;
  readonly topic: string;
  readonly status: ExecutionState;
  readonly events: number;
  readonly notes: readonly string[];
}

export interface RuntimeFacadeOptions {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly operator: string;
  readonly mode: OrchestrationMode;
}

export interface RuntimeWorkspaceState {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly operator: string;
  readonly signal: string;
  readonly mode: OrchestrationMode;
  readonly isBusy: boolean;
  readonly lastRunId: LabRunId | null;
  readonly runCount: number;
  readonly events: readonly LabTimelineBucket[];
  readonly outputSummary: string;
  readonly severity: SeverityBand;
  readonly selectedPlugin: string | null;
}

export interface RuntimeResultRow {
  readonly runId: LabRunId;
  readonly elapsedMs: number;
  readonly summary: string;
  readonly pluginNames: readonly string[];
}

export const severityClassName = (severity: SeverityBand): `severity-${SeverityBand}` => `severity-${severity}`;

export interface MappedTimeline<T extends ControlLabTimeline> {
  readonly byKind: Record<T['events'][number]['kind'], number>;
  readonly stages: readonly string[];
}

export const createInitialState = (options: RuntimeFacadeOptions): RuntimeWorkspaceState => ({
  tenantId: options.tenantId,
  workspaceId: options.workspaceId,
  operator: options.operator,
  signal: 'topology',
  mode: options.mode,
  isBusy: false,
  lastRunId: null,
  runCount: 0,
  events: [],
  outputSummary: 'No runs yet',
  severity: 'low',
  selectedPlugin: null,
});

export const mapRunOutputToResultRow = <TOutput>({ runId, elapsedMs, blueprintId, timeline }: {
  runId: LabRunId;
  elapsedMs: number;
  blueprintId: string;
  timeline: TOutput extends { stages?: readonly string[] }
    ? { stages?: readonly string[]; events?: ReadonlyArray<{ kind: string }> }
    : { stages: readonly string[]; events: ReadonlyArray<{ kind: string }> };
}): RuntimeResultRow => {
  const staged = Array.isArray(timeline.stages) ? timeline.stages.join('>') : 'collect';
  const events = Array.isArray(timeline.events) ? timeline.events : [];
  return {
    runId,
    elapsedMs,
    summary: `${blueprintId}::${staged}`,
    pluginNames: events.map((event) => event.kind),
  };
};
