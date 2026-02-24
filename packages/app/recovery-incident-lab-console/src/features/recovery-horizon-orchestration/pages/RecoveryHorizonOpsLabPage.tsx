import { type ReactElement, useEffect } from 'react';
import { HorizonRunDeck } from '../components/HorizonRunDeck';
import { HorizonPolicyGrid } from '../components/HorizonPolicyGrid';
import { HorizonSignalsFeed } from '../components/HorizonSignalsFeed';
import { HorizonRunSummary } from '../components/HorizonRunSummary';
import { useRecoveryHorizonLabWorkspace } from '../hooks/useRecoveryHorizonLabWorkspace';

interface PolicyRecord {
  readonly policyId: string;
  readonly stage: string;
  readonly status: 'ok' | 'warn' | 'fail';
  readonly impact: number;
  readonly tags: readonly string[];
}

const defaultPolicies: readonly PolicyRecord[] = [
  { policyId: 'policy-ingest-burst', stage: 'ingest', status: 'ok', impact: 1.2, tags: ['edge', 'burst'] },
  { policyId: 'policy-analyze-depth', stage: 'analyze', status: 'warn', impact: 4.4, tags: ['heuristic', 'ml'] },
  { policyId: 'policy-resolve-stability', stage: 'resolve', status: 'fail', impact: 8.2, tags: ['safety', 'guard'] },
  { policyId: 'policy-optimize-bias', stage: 'optimize', status: 'ok', impact: 2.4, tags: ['optimizer', 'bias'] },
  { policyId: 'policy-execute-queue', stage: 'execute', status: 'warn', impact: 3.1, tags: ['throughput'] },
];

const mapModeLabel = (mode: string): string => {
  if (mode === 'live') {
    return 'Live';
  }
  if (mode === 'report-only') {
    return 'Report-Only';
  }
  return 'Recovery mesh';
};

const normalizePolicies = (policies: readonly PolicyRecord[]): readonly PolicyRecord[] => {
  const index = new Map<string, PolicyRecord>();
  for (const policy of policies) {
    index.set(policy.policyId, {
      ...policy,
      impact: policy.impact + (policy.status === 'fail' ? 0.5 : 0),
    });
  }
  return Array.from(index.values());
};

export const RecoveryHorizonOpsLabPage = (): ReactElement => {
  const workspace = useRecoveryHorizonLabWorkspace('tenant-001', 'recovery-horizon-ui');
  const policies = normalizePolicies(defaultPolicies);

  useEffect(() => {
    void workspace.refresh();
  }, [workspace]);

  return (
    <main className="recovery-horizon-ops-lab-page">
      <header>
        <h1>Recovery Horizon Ops Lab</h1>
        <p>
          Tenant: {workspace.tenantId} · Mode: {mapModeLabel(workspace.summary.mode)}
          · Plan: {workspace.plan.id}
          · Ready: {workspace.ready ? 'yes' : 'no'}
        </p>
      </header>
      <section>
        <label htmlFor="plan-id">Plan</label>
        <input
          id="plan-id"
          value={workspace.planLabel}
          onChange={(event) => workspace.setPlanLabel(event.target.value)}
          placeholder="Plan identifier"
        />
        <button
          type="button"
          onClick={() => {
            void workspace.run();
          }}
          disabled={!workspace.ready}
        >
          Run lab orchestration
        </button>
        <button type="button" onClick={() => { void workspace.refresh(); }}>
          Refresh window
        </button>
      </section>
      <HorizonRunDeck
        runHistory={workspace.history}
        trend={workspace.trend}
        onReload={() => {
          return workspace.refresh().then(() => undefined);
        }}
      />
      <HorizonRunSummary summary={workspace.summary} history={workspace.history} />
      <HorizonSignalsFeed
        readResult={{ ok: true, read: { items: [], total: workspace.records }, trend: workspace.trend }}
        trend={workspace.trend}
        onCopy={(value) => {
          void workspace.copy(value);
        }}
      />
      <HorizonPolicyGrid
        policies={policies}
        trend={workspace.trend}
        onToggle={(policyId) => {
          void workspace.copy(policyId);
        }}
        onAcknowledge={(policyId) => {
          void workspace.copy(`ack:${policyId}`);
        }}
      />
    </main>
  );
};

export default RecoveryHorizonOpsLabPage;
