import { useMemo, useState } from 'react';
import { StrategyPlanSummaryCard } from '../components/strategy/StrategyPlanSummaryCard';
import { StrategyCommandLogPanel } from '../components/strategy/StrategyCommandLogPanel';
import { StrategyRunTimeline } from '../components/strategy/StrategyRunTimeline';
import { useRecoveryStrategyOrchestrator } from '../hooks/useRecoveryStrategyOrchestrator';
import { useStrategyStoreProbe } from '../hooks/useStrategyStoreProbe';
import type { CommandToken, StrategyTemplate } from '@domain/recovery-orchestration-planning';
import { useStrategyPlanner } from '../hooks/useStrategyPlanner';

interface RecoveryStrategyOrchestrationPageProps {
  readonly tenantId: string;
}

export const RecoveryStrategyOrchestrationPage = ({ tenantId }: RecoveryStrategyOrchestrationPageProps) => {
  const [activeTemplateId, setActiveTemplateId] = useState('template-default');
  const [selectedCommand, setSelectedCommand] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('');

  const probe = useStrategyStoreProbe();
  const orchestrator = useRecoveryStrategyOrchestrator(tenantId);

  const syntheticTemplate = useMemo<StrategyTemplate>(
    () => ({
      templateId: `template-${tenantId}` as StrategyTemplate['templateId'],
      name: 'Recovery strategy template',
      description: 'Synthetic template for workspace simulation',
      phase: 'simulation',
      createdBy: 'operator',
      createdAt: new Date().toISOString(),
      targets: [
        {
          targetId: 'svc-auth',
          serviceName: 'auth-service',
          zone: 'us-east-1',
          ownerTeam: 'identity',
          baselineRtoMinutes: 30,
          targetRtoMinutes: 12,
          criticality: 4,
        },
      ],
      dependencies: [{ from: 'step-1', to: ['step-2'], soft: false }],
      steps: [
        {
          stepId: 'step-1',
          runbook: 'notify-stakeholders',
          phase: 'inbound',
          command: {
            commandId: 'cmd-notify',
            commandType: 'notify',
            targetId: 'svc-auth',
            timeoutSeconds: 30,
            retryLimit: 2,
            estimatedMinutes: 5,
            requiresHumanApproval: false,
            token: 'token-1' as CommandToken,
            dependencies: [],
          },
          expectedRiskReduction: 0.15,
          maxParallelism: 1,
          constraints: [],
          canAbort: false,
        },
        {
          stepId: 'step-2',
          runbook: 'isolate-failures',
          phase: 'simulation',
          command: {
            commandId: 'cmd-isolate',
            commandType: 'isolate',
            targetId: 'svc-auth',
            timeoutSeconds: 45,
            retryLimit: 1,
            estimatedMinutes: 3,
            requiresHumanApproval: false,
            token: 'token-2' as CommandToken,
            dependencies: ['cmd-notify'],
          },
          expectedRiskReduction: 0.4,
          maxParallelism: 2,
          constraints: [{ key: 'region', value: 'us-east-1', optional: false }],
          canAbort: true,
        },
      ],
    }),
    [tenantId],
  );

  const planner = useStrategyPlanner(syntheticTemplate);

  return (
    <main>
      <section>
        <h1>Recovery Strategy Orchestration</h1>
        <p>tenant={tenantId}</p>
        <p>template={activeTemplateId}</p>
        <p>stores={probe.totalPlans}</p>
        <button onClick={() => setActiveTemplateId(`template-${Date.now()}`)}>refresh-template-id</button>
      </section>

      <section>
        <h2>Template shape</h2>
        <button onClick={() => void orchestrator.actions.buildWorkspace(syntheticTemplate)}>Build workspace</button>
        <button onClick={() => void orchestrator.actions.startRun(syntheticTemplate)}>Start run</button>
        <button onClick={() => void probe.actions.refresh()}>Reload probe</button>
      </section>

      <section>
        <h2>Template analytics</h2>
        <ul>
          <li>targets={planner.totalTargets}</li>
          <li>criticality={planner.criticalityAvg.toFixed(2)}</li>
          <li>parallelizable={planner.canRunInParallel ? 'yes' : 'no'}</li>
          <li>steps={planner.orderedSteps.map((step) => step.stepId).join(', ')}</li>
        </ul>
      </section>

      {orchestrator.state.workspace ? <StrategyPlanSummaryCard workspace={orchestrator.state.workspace} /> : null}

      <section>
        <button onClick={() => void orchestrator.actions.appendCommand(selectedPlan || 'template-default', 'heartbeat')}>
          Append command
        </button>
        <input value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value)} />
        <input value={selectedCommand} onChange={(event) => setSelectedCommand(event.target.value)} />
      </section>

      <section>
        {orchestrator.state.workspace ? (
          <StrategyRunTimeline
            run={orchestrator.state.workspace.run}
            results={[
              {
                commandId: selectedCommand || 'init',
                status: 'ok',
                executedAt: new Date().toISOString(),
                durationSeconds: 12,
                outputSummary: 'initialization complete',
              },
            ]}
            onSelectCommand={(commandId) => setSelectedCommand(commandId)}
          />
        ) : null}
      </section>

      <section>
        <StrategyCommandLogPanel
          events={probe.matching.flatMap((record) =>
            record.commandLog.map((entry, index) => ({
              tenantId: record.tenantId,
              type: index % 2 === 0 ? 'plan-created' : 'run-created',
              planId: record.plan.strategyId,
              createdAt: new Date().toISOString(),
            })),
          )}
          onFilter={(planId) => setSelectedPlan(planId)}
        />
      </section>

      <section>
        <pre>{orchestrator.state.summary ? JSON.stringify(orchestrator.state.summary, null, 2) : 'loading summary'}</pre>
      </section>
    </main>
  );
};
