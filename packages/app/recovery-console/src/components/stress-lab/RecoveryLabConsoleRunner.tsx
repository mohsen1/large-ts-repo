import { useMemo } from 'react';
import { useRecoveryStressLab } from '../../hooks/useRecoveryStressLab';
import { parseFleetManifest } from '@service/recovery-stress-lab-orchestrator/stress-lab-fleet';
import { buildFleetPlan, parseFleetInput } from '@service/recovery-stress-lab-orchestrator/stress-lab-fleet';

type ActionButtonState = 'idle' | 'running' | 'disabled';

interface RecoveryLabConsoleRunnerProps {
  readonly tenantId: string;
  readonly zone: string;
}

export function RecoveryLabConsoleRunner({ tenantId, zone }: RecoveryLabConsoleRunnerProps) {
  const { state, run, observe, inspect, isBusy, runtimePlan, manifest, nodeCount } = useRecoveryStressLab(tenantId, zone);

  const graph = useMemo(() => {
    const fixture = {
      region: zone,
      nodes: [
        { id: 'seed', lane: 'observe', kind: 'seed', outputs: ['simulate'] },
        { id: 'simulate', lane: 'simulate', kind: 'simulate', outputs: ['recommend'] },
        { id: 'recommend', lane: 'recommend', kind: 'recommend', outputs: ['restore'] },
        { id: 'restore', lane: 'restore', kind: 'restore', outputs: [] },
      ],
      edges: [
        { id: 'seed->simulate', from: 'seed', to: ['simulate'], direction: 'northbound', channel: 'seed-channel' },
        { id: 'simulate->recommend', from: 'simulate', to: ['recommend'], direction: 'interlane', channel: 'simulate-channel' },
        { id: 'recommend->restore', from: 'recommend', to: ['restore'], direction: 'southbound', channel: 'restore-channel' },
      ],
    };
    const normalized = parseFleetInput(fixture);
    const plan = buildFleetPlan(tenantId, zone, normalized);
    return {
      nodes: plan.graph.nodes,
      edges: plan.graph.edges,
      signature: parseFleetManifest(JSON.stringify({ tenant: tenantId, zone, revision: 1 })).tenant,
    };
  }, [tenantId, zone]);

  const status = isBusy ? 'running' : 'idle';
  const buttonState: ActionButtonState = isBusy ? 'running' : 'idle';

  return (
    <section className="recovery-lab-console-runner">
      <h2>Recovery Lab Runner</h2>
      <p>
        Tenant: <strong>{manifest.tenant}</strong>
      </p>
      <p>
        Zone: <strong>{manifest.zone}</strong> · Nodes: {nodeCount} · Graph nodes: {graph.nodes.length}
      </p>
      <p>Status: {status}</p>
      <p>Signature: {graph.signature}</p>
      <ul>
        {state.observations.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
      {state.error ? <p role="alert">{state.error}</p> : null}
      <button
        type="button"
        disabled={buttonState === 'running'}
        onClick={() => {
          void run();
        }}
      >
        Run stress lab
      </button>
      <button
        type="button"
        disabled={buttonState === 'running'}
        onClick={() => {
          void observe();
        }}
      >
        Observe
      </button>
      <button
        type="button"
        disabled={buttonState === 'running'}
        onClick={() => {
          void inspect();
        }}
      >
        Inspect
      </button>
      <pre>{JSON.stringify(runtimePlan, null, 2)}</pre>
    </section>
  );
}
