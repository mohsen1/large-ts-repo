import { useMemo, useState } from 'react';
import { useRecoveryOpsPlaybook } from '../hooks/useRecoveryOpsPlaybook';
import { RecoveryOpsPlaybookDashboard } from '../components/RecoveryOpsPlaybookDashboard';
import { RecoveryOpsPlaybookRiskGauge } from '../components/RecoveryOpsPlaybookRiskGauge';
import { RecoveryPlaybookTimeline } from '../components/RecoveryPlaybookTimeline';
import type { PlaybookState } from '../hooks/useRecoveryOpsPlaybook';
import { z } from 'zod';

const mockBlueprint = {
  id: 'pb-ops-001',
  title: 'Cross-Region Failover Playbook',
  service: 'recovery-platform',
  severity: 'major',
  tier: 'high',
  timeline: {
    startAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    endAt: new Date(Date.now() + 40 * 60 * 1000).toISOString(),
    timezone: 'UTC',
  },
  owner: 'SRE Platform',
  labels: ['cross-region', 'failover', 'high-risk'],
  steps: [
    {
      id: 'step-assess',
      title: 'Assess blast radius',
      kind: 'assess',
      scope: 'service',
      ownerTeam: 'sre-core',
      dependencies: [],
      expectedLatencyMinutes: 18,
      riskDelta: -5,
      automationLevel: 1,
      metadata: { canary: true, source: 'synthetic' },
      actions: [{ type: 'metric', target: 'region-a', parameters: { windowMinutes: 8 } }],
    },
    {
      id: 'step-isolate',
      title: 'Isolate impacted cluster',
      kind: 'isolate',
      scope: 'service',
      ownerTeam: 'incident-engineering',
      dependencies: ['step-assess'],
      expectedLatencyMinutes: 35,
      riskDelta: 12,
      automationLevel: 2,
      metadata: { requiresApproval: true },
      actions: [{ type: 'network', target: 'cluster-a', parameters: { shutdown: true } }],
    },
    {
      id: 'step-restore',
      title: 'Restore standby cluster',
      kind: 'restore',
      scope: 'region',
      ownerTeam: 'infra-runtime',
      dependencies: ['step-isolate'],
      expectedLatencyMinutes: 40,
      riskDelta: 25,
      automationLevel: 4,
      metadata: { requiresSnapshot: true },
      actions: [{ type: 'restore', target: 'cluster-b', parameters: { waitForReady: true } }],
    },
    {
      id: 'step-verify',
      title: 'Verify workload health',
      kind: 'verify',
      scope: 'workload',
      ownerTeam: 'quality-assurance',
      dependencies: ['step-restore'],
      expectedLatencyMinutes: 28,
      riskDelta: -10,
      automationLevel: 3,
      metadata: { synthetic: true },
      actions: [{ type: 'probe', target: 'api', parameters: { statusCode: 200 } }],
    },
    {
      id: 'step-postmortem',
      title: 'Capture evidence',
      kind: 'postmortem',
      scope: 'global',
      ownerTeam: 'incident-command',
      dependencies: ['step-verify'],
      expectedLatencyMinutes: 24,
      riskDelta: -2,
      automationLevel: 1,
      metadata: { storeArtifacts: true },
      actions: [{ type: 'store', target: 'artifact-bucket', parameters: { retentionDays: 90 } }],
    },
  ],
  createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
  version: 12,
};

const runSchema = z.object({
  id: z.string(),
  playbookId: z.string(),
  triggeredBy: z.string(),
  startedAt: z.string(),
  window: z.object({
    startAt: z.string(),
    endAt: z.string(),
    timezone: z.string(),
  }),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'aborted']),
  outcomeByStep: z.record(z.object({
    status: z.enum(['pending', 'running', 'passed', 'failed', 'skipped']),
    attempt: z.number(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    details: z.record(z.string()),
    nextStepIds: z.array(z.string()),
  })),
  notes: z.array(z.string()),
});

const getMockRun = () => runSchema.parse({
  id: 'run-2026-02-23',
  playbookId: mockBlueprint.id,
  triggeredBy: 'automation',
  startedAt: new Date().toISOString(),
  window: {
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
    timezone: 'UTC',
  },
  status: 'active',
  outcomeByStep: {
    'step-assess': {
      status: 'passed',
      attempt: 1,
      startedAt: new Date().toISOString(),
      finishedAt: new Date(Date.now() + 18 * 60 * 1000).toISOString(),
      details: { checks: 'ok' },
      nextStepIds: ['step-isolate'],
    },
    'step-isolate': {
      status: 'running',
      attempt: 1,
      startedAt: new Date().toISOString(),
      details: { blastRadius: 'stabilized' },
      nextStepIds: ['step-restore'],
    },
    'step-restore': {
      status: 'pending',
      attempt: 0,
      details: {},
      nextStepIds: ['step-verify'],
    },
    'step-verify': {
      status: 'pending',
      attempt: 0,
      details: {},
      nextStepIds: ['step-postmortem'],
    },
    'step-postmortem': {
      status: 'pending',
      attempt: 0,
      details: {},
      nextStepIds: [],
    },
  },
  notes: ['initial synthetic run'],
});

export const RecoveryPlaybookOperationsRoomPage = () => {
  const [selection, setSelection] = useState('step-isolate');
  const { state, refresh, runCatalog, setDrafts, setScope, setQuery } = useRecoveryOpsPlaybook({
    blueprint: mockBlueprint,
    runbook: getMockRun(),
  });

  const header = useMemo(() => {
    const hasError = Boolean(state.error);
    if (state.status === 'failed') {
      return hasError ? `Playbook orchestration failed: ${state.error}` : 'Playbook orchestration failed';
    }
    if (state.status === 'running') {
      return 'Playbook orchestration in progress';
    }
    if (state.status === 'ready') {
      return 'Playbook orchestration ready';
    }
    return 'Initializing playbook workspace';
  }, [state.error, state.status]);

  const historyEntries = (state.runHistory as Array<{ runId: string; updatedAt: string; metrics: { completion: number; traceLength: number }; confidence: number }>) || [];

  return (
    <main style={{
      display: 'grid',
      gap: '1rem',
      padding: '1rem',
      color: '#e2e8f0',
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #020617, #0f172a 18%, #1e293b 100%)',
    }}>
      <section style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
      }}>
        <h1 style={{ margin: 0 }}>{header}</h1>
        <p style={{ color: '#94a3b8', margin: 0 }}>Selected step: {selection}</p>
      </section>

      <RecoveryOpsPlaybookDashboard
        state={state}
        onRefresh={refresh}
        onRerun={() => {
          void runCatalog();
        }}
      />

      <section style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
      }}>
        <RecoveryOpsPlaybookRiskGauge state={state} title="Run confidence" threshold={72} />
        <RecoveryPlaybookTimeline
          snapshot={state.snapshot}
          onSelectStep={(id) => {
            setSelection(id);
          }}
        />
      </section>

      <section style={{
        borderRadius: '0.9rem',
        border: '1px solid rgba(148,163,184,0.2)',
        padding: '0.75rem',
        background: 'rgba(15,23,42,0.65)',
      }}>
        <h3 style={{ marginTop: 0 }}>Run catalog controls</h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <button onClick={() => setScope('global')} type="button" style={{ borderRadius: 6 }}>
            Scope global
          </button>
          <button onClick={() => setScope('service')} type="button" style={{ borderRadius: 6 }}>
            Scope service
          </button>
          <button onClick={() => setScope('workload')} type="button" style={{ borderRadius: 6 }}>
            Scope workload
          </button>
          <button onClick={() => setDrafts(true)} type="button" style={{ borderRadius: 6 }}>
            Include draft runs
          </button>
          <button onClick={() => setDrafts(false)} type="button" style={{ borderRadius: 6 }}>
            Exclude draft runs
          </button>
          <button
            onClick={() => {
              setQuery((prev) => ({ ...prev, owner: 'sre-platform' }));
            }}
            type="button"
            style={{ borderRadius: 6 }}
          >
            Set owner
          </button>
        </div>

        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {historyEntries.length === 0 ? (
            <div style={{ color: '#94a3b8' }}>No history entries yet.</div>
          ) : (
            historyEntries.map((entry) => (
              <div key={entry.runId} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.45rem',
                borderBottom: '1px solid rgba(148,163,184,0.2)',
              }}>
                <span>{entry.runId}</span>
                <span>{entry.updatedAt}</span>
                <span>completion {Math.round(entry.metrics.completion * 100)}%</span>
                <span>traces {entry.metrics.traceLength}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
};

export default RecoveryPlaybookOperationsRoomPage;
