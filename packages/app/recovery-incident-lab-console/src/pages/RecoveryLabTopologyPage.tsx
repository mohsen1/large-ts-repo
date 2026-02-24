import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { createControlRunId } from '@domain/recovery-incident-lab-core';
import { useRecoveryIncidentLabWorkspace } from '../hooks/useRecoveryIncidentLabWorkspace';
import { RecoveryLabTopologyMatrix } from '../components/RecoveryLabTopologyMatrix';
import { buildDispatchPlan } from '../services/recoveryLabPluginDispatcher';

interface TopologyRow {
  readonly scope: string;
  readonly key: string;
}

const flattenTopology = (rows: readonly TopologyRow[]) =>
  rows.map((entry) => `${entry.scope}:${entry.key}`).toSorted();

const buildPlanFingerprint = (runId: string): string =>
  `plan-${runId}`.toUpperCase();

export const RecoveryLabTopologyPage = (): ReactElement => {
  const workspace = useRecoveryIncidentLabWorkspace();
  const [scope, setScope] = useState<string>('tenant');
  const [refreshTick, setRefreshTick] = useState(0);

  const plan = workspace.plan;
  const scenario = workspace.state.scenario;
  const planId = useMemo(
    () => (plan ? buildPlanFingerprint(plan.id) : 'PLAN:UNINITIALIZED'),
    [plan?.id],
  );

  const dispatchPlan = useMemo(
    () =>
      buildDispatchPlan(['topology', 'signal', 'policy', 'runtime'] as const).map((entry) => ({
        scope,
        key: `${entry.output}-${entry.input}`,
      })),
    [scope],
  );

  const events = useMemo(() => flattenTopology(dispatchPlan), [dispatchPlan]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshTick((current) => (current + 1) % 10000);
    }, 500);
    return () => window.clearInterval(interval);
  }, []);

  const workspaceId = useMemo(
    () => createControlRunId(`topology:${scenario?.id ?? 'scenario'}:${refreshTick}`),
    [scenario?.id, refreshTick],
  );

  return (
    <main className="recovery-lab-topology-page">
      <header>
        <h1>Recovery Lab Topology</h1>
        <p>{workspaceId}</p>
        <p>{planId}</p>
      </header>
      <RecoveryLabTopologyMatrix title="Topology path" events={events} />
      <section>
        <label>
          scope:
          <select value={scope} onChange={(event) => setScope(event.currentTarget.value)}>
            <option value="tenant">tenant</option>
            <option value="topology">topology</option>
            <option value="signal">signal</option>
            <option value="policy">policy</option>
          </select>
        </label>
        <button type="button" onClick={() => setRefreshTick((current) => current + 1)}>
          refresh
        </button>
      </section>
    </main>
  );
};
