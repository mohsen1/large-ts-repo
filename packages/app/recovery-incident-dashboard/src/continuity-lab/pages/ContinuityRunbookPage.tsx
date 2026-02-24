import { useMemo } from 'react';
import { useContinuityRunbookWorkspace } from '../hooks/useContinuityRunbookWorkspace';
import { ContinuityRunbookControlPanel } from '../components/ContinuityRunbookControlPanel';
import { ContinuityRunbookTimeline } from '../components/ContinuityRunbookTimeline';
import { ContinuityRunbookSummaryCard } from '../components/ContinuityRunbookSummaryCard';
import { ContinuityRunbookQueue } from '../components/ContinuityRunbookQueue';
import type { IncidentRecord } from '@domain/recovery-incident-orchestration';
import { withBrand } from '@shared/core';

type PlanItem = {
  readonly id: string;
  readonly plan: string;
};

export const ContinuityRunbookPage = ({ tenant = 'tenant-ops' }: { tenant?: string }) => {
  const { state, actions } = useContinuityRunbookWorkspace(tenant);

  const queue = useMemo(
    () => state.queue.flatMap((entry) => entry.manifests.map((manifest) => manifest.trace.events.join(','))),
    [state.queue],
  );

  const summary = useMemo<readonly PlanItem[]>(() => {
    const derived = state.summaries.map((item, index) => ({
      id: `${item.sessionId}-${index}`,
      plan: `${item.status}-${item.score}`,
    }));

    return derived.length === 0
      ? [{ id: 'none', plan: 'none' }]
      : derived;
  }, [state.summaries]);

  const incidentSeed = useMemo<IncidentRecord>(() => ({
    id: withBrand(`${tenant}:seed`, 'IncidentId'),
    title: 'auto-incident',
    summary: 'continuity seed',
    scope: {
      tenantId: tenant,
      clusterId: 'cluster-01',
      region: 'us-east-1',
      serviceName: 'continuity-service',
    },
    severity: 'medium',
    labels: ['continuity', 'runbook'],
    openedAt: new Date().toISOString(),
    detectedAt: new Date().toISOString(),
    snapshots: [],
    signals: [],
    metadata: {},
  }), [tenant]);

  return (
    <main>
      <h1>Continuity Runbook Lab</h1>
      <ContinuityRunbookControlPanel
        loading={state.loading}
        templates={state.templates}
        onCreate={() => void actions.createFromIncident(incidentSeed)}
        onExecute={actions.execute}
        onRefresh={actions.refresh}
      />
      <ContinuityRunbookTimeline queue={state.queue} />
      {state.workspace.templates[0] && state.summaries[0] ? (
          <ContinuityRunbookSummaryCard
            summary={{
              sessionId: state.workspace.id,
              score: state.queue.length,
              status: state.summaries[0]?.status,
            policy: state.summaries[0]?.policyCount > 0
              ? {
                  enforceSla: true,
                  minReadiness: 0.5,
                  maxParallelism: 4,
                  clauses: [{ name: 'default', weight: 1, windowMinutes: 5 }],
                  allowAsyncRollback: true,
                }
              : {
                  enforceSla: true,
                  minReadiness: 0.2,
                  maxParallelism: 1,
                  clauses: [],
                  allowAsyncRollback: false,
                },
            tags: ['state'],
          }}
          templates={state.templates}
          apiSummary={state.summaries[0] ?? {
            sessionId: String(state.workspace.id),
            score: 0,
            status: 'queued',
            policyCount: 0,
          }}
        />
      ) : null}
      <ContinuityRunbookQueue entries={summary.map((entry) => `${entry.id}:${entry.plan}`)} />
    </main>
  );
};
