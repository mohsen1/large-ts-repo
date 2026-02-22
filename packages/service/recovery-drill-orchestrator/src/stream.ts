import type { DrillDependencies, DrillProgressEvent } from './types';
import type { DrillRunRecord, DrillStoreQuery } from '@data/recovery-drill-store/src';
import { safeParseTenant, summarizeTenantRuns } from './adapters';
import { summarizeTemplates } from '@data/recovery-drill-store/src';

export interface StreamSegment {
  readonly at: string;
  readonly runId: string;
  readonly status: DrillProgressEvent['status'];
  readonly details?: string;
}

export interface StreamSnapshot {
  readonly tenant: string;
  readonly total: number;
  readonly open: number;
  readonly segments: readonly StreamSegment[];
}

interface RunStreamState {
  readonly tenant: string;
  readonly runId: string;
  readonly events: readonly DrillProgressEvent[];
}

const buildSegments = (state: RunStreamState): readonly StreamSegment[] =>
  state.events.map((event) => ({
    at: event.at,
    runId: state.runId,
    status: event.status,
    details: event.details,
  }));

export const buildStreamFromRuns = (tenant: string, runs: readonly DrillRunRecord[]): StreamSnapshot => {
  const segments: StreamSegment[] = runs.flatMap((run) => {
    const events: DrillProgressEvent[] = [
      {
        runId: run.id,
        status: run.status,
        at: run.startedAt ?? new Date().toISOString(),
        details: `template=${run.templateId}`,
      },
      {
        runId: run.id,
        status: run.status,
        at: run.endedAt ?? run.startedAt ?? new Date().toISOString(),
        details: `completed:${run.checkpoints.length}`,
      },
    ];
    return buildSegments({ tenant, runId: run.id, events });
  });
  const open = summarizeTenantRuns(runs).active;

  return {
    tenant,
    total: runs.length,
    open,
    segments: segments.sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, 256),
  };
};

export const summarizeStreamTenant = async (dependencies: DrillDependencies, tenantId: string): Promise<StreamSnapshot> => {
  const resolvedTenant = safeParseTenant(tenantId);
  if (!resolvedTenant.ok) {
    return {
      tenant: tenantId,
      total: 0,
      open: 0,
      segments: [],
    };
  }

  const runsResult = await dependencies.runs.listRuns({ tenant: resolvedTenant.value, status: undefined } as DrillStoreQuery);
  const templateResult = await dependencies.templates.listTemplates(resolvedTenant.value);
  void summarizeTemplates(templateResult);
  return buildStreamFromRuns(tenantId, runsResult.items);
};
