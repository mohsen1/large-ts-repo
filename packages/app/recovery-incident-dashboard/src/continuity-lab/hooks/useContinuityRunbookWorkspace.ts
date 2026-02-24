import { useCallback, useEffect, useMemo, useState } from 'react';
import { ContinuityOrchestrationService, type ContinuityExecutionOutput } from '@service/recovery-runner';
import {
  RecoveryWorkflowRepository,
  buildContinuityTemplate,
  createContinuityWorkspace,
} from '@data/recovery-workflow-store';
import {
  ContinuityWorkspace,
  buildContinuitySessionId,
  type ContinuityTemplate,
} from '@domain/recovery-incident-workflows';
import { toApiSummary } from '@service/recovery-runner';
import type { IncidentRecord } from '@domain/recovery-incident-orchestration';
import { withBrand } from '@shared/core';

type WorkspaceState = {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly lastError?: string;
};

export interface ContinuityRunbookWorkspaceState {
  readonly loading: boolean;
  readonly tenant: string;
  readonly templates: readonly ContinuityTemplate[];
  readonly queue: readonly ContinuityExecutionOutput[];
  readonly summaries: readonly ReturnType<typeof toApiSummary>[];
  readonly workspace: ContinuityWorkspace | null;
}

export interface ContinuityRunbookWorkspaceActions {
  readonly refresh: () => Promise<void>;
  readonly createFromIncident: (incident: IncidentRecord) => Promise<void>;
  readonly execute: () => Promise<void>;
  readonly inspect: (planId: string) => void;
}

const emptyWorkspace = (tenant: string): ContinuityWorkspace => createContinuityWorkspace(
  tenant,
  'blank',
  [],
);

export const useContinuityRunbookWorkspace = (tenant: string) => {
  const repository = useMemo(() => new RecoveryWorkflowRepository(), []);
  const orchestrator = useMemo(() => new ContinuityOrchestrationService(repository), [repository]);

  const [workspace, setWorkspace] = useState<ContinuityWorkspace>(emptyWorkspace(tenant));
  const [queue, setQueue] = useState<readonly ContinuityExecutionOutput[]>([]);
  const [summaries, setSummaries] = useState<readonly ReturnType<typeof toApiSummary>[]>([]);
  const [status, setStatus] = useState<WorkspaceState>({ status: 'idle' });

  const refresh = useCallback(async () => {
    setStatus({ status: 'loading' });
    try {
      const records = await orchestrator.buildSummary(tenant);
      setSummaries(records.map(toApiSummary));
      setStatus({ status: 'ready' });
    } catch (error) {
      setStatus({ status: 'error', lastError: String(error) });
    }
  }, [tenant, orchestrator]);

  const createFromIncident = useCallback(async (incident: IncidentRecord) => {
    setStatus({ status: 'loading' });
    try {
      const planId = withBrand(`${tenant}:${incident.id}`, 'IncidentPlanId');
      const template = buildContinuityTemplate(incident, planId);
      const nextWorkspace: ContinuityWorkspace = {
        ...emptyWorkspace(tenant),
        templates: [template],
        id: buildContinuitySessionId(tenant, `${incident.id}:${Date.now()}`),
      };
      setWorkspace(nextWorkspace);
      setStatus({ status: 'ready' });
    } catch (error) {
      setStatus({ status: 'error', lastError: String(error) });
    }
  }, [tenant]);

  const execute = useCallback(async () => {
    setStatus({ status: 'loading' });
    try {
      const outputs = await orchestrator.runForIncident({
        id: `${tenant}:run-${Date.now()}`,
        templates: workspace.templates,
      });

      setQueue(outputs);
      setStatus({ status: 'ready' });
    } catch (error) {
      setStatus({ status: 'error', lastError: String(error) });
    }
  }, [tenant, workspace.templates, orchestrator]);

  const inspect = useCallback((planId: string) => {
    void planId;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loading = status.status === 'loading';

  return {
    state: {
      loading,
      tenant,
      templates: workspace.templates,
      queue,
      summaries,
      workspace,
    },
    actions: {
      refresh,
      createFromIncident,
      execute,
      inspect,
    },
  } satisfies {
    state: ContinuityRunbookWorkspaceState;
    actions: ContinuityRunbookWorkspaceActions;
  };
};
