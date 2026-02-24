import { type Brand, asTenantId, type IsoTimestamp } from '@shared/temporal-ops-runtime';
import type { RuntimeExecution, RuntimeOrchestrationOptions } from '@service/recovery-temporal-orchestrator';

export type TemporalStudioMode = 'plan' | 'runtime' | 'signals' | 'diagnostics';

export interface TemporalStudioRow {
  readonly runId: Brand<string, 'RunId'>;
  readonly tenant: string;
  readonly actor: string;
  readonly candidateNames: readonly string[];
  readonly planName: string;
  readonly mode: TemporalStudioMode;
  readonly triggeredAt: IsoTimestamp;
}

export interface TemporalTimelineEntry {
  readonly stage: string;
  readonly state: 'pending' | 'active' | 'complete' | 'error';
  readonly startedAt: IsoTimestamp;
  readonly endedAt?: IsoTimestamp;
  readonly message: string;
}

export interface TemporalStudioState {
  readonly rows: readonly TemporalStudioRow[];
  readonly timeline: readonly TemporalTimelineEntry[];
  readonly loading: boolean;
  readonly selectedRun?: Brand<string, 'RunId'>;
  readonly mode: TemporalStudioMode;
  readonly diagnostics: {
    readonly runCount: number;
    readonly hasData: boolean;
  };
}

export interface TemporalStudioAction {
  readonly type: 'hydrate' | 'set-rows' | 'set-timeline' | 'set-mode' | 'set-selected';
  readonly payload?: unknown;
}

export interface TemporalStudioFacadeInput {
  readonly options: RuntimeOrchestrationOptions;
  readonly tenant: string;
  readonly actor: string;
}

export interface TemporalStudioRowView extends TemporalStudioRow {
  readonly status: 'queued' | 'running' | 'complete' | 'failed';
  readonly lastSignal: string;
  readonly planSignals: number;
}

export const toRowView = (row: TemporalStudioRow): TemporalStudioRowView => ({
  ...row,
  status: row.mode === 'runtime' ? 'running' : row.mode === 'signals' ? 'complete' : 'queued',
  lastSignal: String(row.triggeredAt),
  planSignals: row.candidateNames.length,
});

export type TemporalExecutionResult = Pick<RuntimeExecution, 'runId' | 'tenant' | 'telemetryCount' | 'storeProjection'> & {
  readonly startedAt: IsoTimestamp;
  readonly finishedAt?: IsoTimestamp;
};

export const modePalette: Record<TemporalStudioMode, { readonly accent: string; readonly text: string }> = {
  plan: {
    accent: '#60a5fa',
    text: '#e0e7ff',
  },
  runtime: {
    accent: '#22c55e',
    text: '#d1fae5',
  },
  signals: {
    accent: '#8b5cf6',
    text: '#e9d5ff',
  },
  diagnostics: {
    accent: '#f59e0b',
    text: '#fef3c7',
  },
};

export const modeRank: Record<TemporalStudioMode, number> = {
  plan: 1,
  runtime: 2,
  signals: 3,
  diagnostics: 4,
};

export const formatTenant = (tenant: string): Brand<string, 'TenantId'> => {
  return asTenantId(tenant.trim().toLowerCase() || 'global');
};

export const createEmptyTimeline = (): readonly TemporalTimelineEntry[] => [
  {
    stage: 'bootstrap',
    state: 'pending',
    startedAt: new Date().toISOString() as IsoTimestamp,
    message: 'Awaiting plan initialization',
  },
  {
    stage: 'plan',
    state: 'pending',
    startedAt: new Date().toISOString() as IsoTimestamp,
    message: 'Drafting candidates',
  },
  {
    stage: 'runtime',
    state: 'pending',
    startedAt: new Date().toISOString() as IsoTimestamp,
    message: 'Orchestration not started',
  },
];
