import { FC, useState } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { RecoveryCockpitOrchestrator } from '@service/recovery-cockpit-orchestrator';
import { createInMemoryWorkspace } from '@service/recovery-cockpit-orchestrator';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';

export type PlanOpsConsoleProps = {
  readonly plans: readonly RecoveryPlan[];
  readonly onPlanStarted: (planId: string) => void;
};

type ExecutionLane = {
  readonly planId: string;
  readonly actionCount: number;
  readonly startedAt: string;
  readonly state: 'idle' | 'running' | 'done';
};

const laneState = (plan: RecoveryPlan, running: string): ExecutionLane => {
  const startedAt = new Date().toISOString();
  return {
    planId: plan.planId,
    actionCount: plan.actions.length,
    startedAt,
    state: plan.actions.length > 10 ? 'done' : running === plan.planId ? 'running' : 'idle',
  };
};

export const PlanOpsConsole: FC<PlanOpsConsoleProps> = ({ plans, onPlanStarted }) => {
  const [selected, setSelected] = useState('');
  const [running, setRunning] = useState('');

  const store = new InMemoryCockpitStore();
  const workspace = createInMemoryWorkspace(store);
  const orchestrator = new RecoveryCockpitOrchestrator(workspace, workspace.clock, { parallelism: 2, maxRuntimeMinutes: 120, retryPolicy: { enabled: true, maxRetries: 2 }, policyMode: 'advisory' });

  const lanes = plans.map((plan) => laneState(plan, running));

  const start = async (plan: RecoveryPlan) => {
    setRunning(plan.planId);
    await orchestrator.start(plan);
    setRunning('');
    onPlanStarted(plan.planId);
  };

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fafafa' }}>
      <header>
        <h3>Plan orchestration console</h3>
      </header>
      <ul style={{ padding: 0, listStyle: 'none', margin: 0, display: 'grid', gap: 10 }}>
        {lanes.map((lane) => {
          const selectedPlan = plans.find((candidate) => candidate.planId === lane.planId);
          return (
            <li key={lane.planId} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <strong>{selectedPlan?.labels.short ?? lane.planId}</strong>
                  <p style={{ margin: 0 }}>{lane.state} · {lane.actionCount} actions</p>
                  <small>{lane.startedAt}</small>
                </div>
                <button
                  type="button"
                  onClick={() => selectedPlan && void start(selectedPlan)}
                  disabled={!selectedPlan || lane.state === 'running'}
                >
                  Start
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {selected ? <p>Selected: {selected}</p> : null}
      <footer style={{ marginTop: 12 }}>
        <button type="button" onClick={() => setSelected(plans[0]?.planId ?? '')}>
          Seed selection
        </button>
        <button type="button" onClick={() => setSelected('')} style={{ marginLeft: 8 }}>
          Clear
        </button>
      </footer>
    </section>
  );
};
