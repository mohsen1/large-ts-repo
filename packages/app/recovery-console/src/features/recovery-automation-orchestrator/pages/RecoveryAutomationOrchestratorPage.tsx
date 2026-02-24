import { useMemo, useState } from 'react';
import type { AutomationTenantId } from '@domain/recovery-automation-orchestrator';
import { useRecoveryAutomationOrchestrator } from '../hooks/useRecoveryAutomationOrchestrator';
import { catalogPlans, loadCatalog } from '../services/automationOrchestratorService';
import { AutomationCommandBoard } from '../components/AutomationCommandBoard';
import { AutomationPulseTimeline } from '../components/AutomationPulseTimeline';
import { AutomationStatusDeck } from '../components/AutomationStatusDeck';
import type { AutomationDashboardCommand } from '../types';

const defaultCommands = (commands: readonly AutomationDashboardCommand[]) =>
  commands.map((command) => ({
    ...command,
    enabled: true,
  }));

const asTenant = (tenant: string): AutomationTenantId => tenant as AutomationTenantId;

export const RecoveryAutomationOrchestratorPage = () => {
  const { run, viewModel, isBusy, execute, refresh, setPlanId, setTenant } = useRecoveryAutomationOrchestrator();
  const [commands, setCommands] = useState<readonly AutomationDashboardCommand[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<AutomationTenantId>('tenant:global' as AutomationTenantId);
  const [selectedPlan, setSelectedPlan] = useState('plan:incident-lifecycle:v2.0');
  const catalog = useMemo(() => loadCatalog(), []);
  const plans = useMemo(() => catalogPlans(selectedTenant), [selectedTenant]);

  const onToggleCommand = (command: AutomationDashboardCommand) => {
    const next = commands.length > 0 ? commands : defaultCommands(viewModel.commands);
    setCommands(next.map((entry) => (entry.id === command.id ? { ...entry, enabled: !entry.enabled } : entry)));
  };

  const onRunCommand = (_command: AutomationDashboardCommand) => {
    void execute();
  };

  return (
    <main className="recovery-automation-orchestrator-page">
      <AutomationStatusDeck viewModel={viewModel} />
      <section className="automation-controls">
        <label>
          Tenant
          <select
            value={selectedTenant}
            onChange={(event) => {
              const tenant = asTenant(event.target.value as string);
              setSelectedTenant(tenant);
              setTenant(tenant);
            }}
          >
            {catalog.map((entry) => (
              <option key={entry.tenant} value={entry.tenant}>
                {entry.tenant}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plan
          <select
            value={selectedPlan}
            onChange={(event) => {
              const plan = event.target.value;
              setSelectedPlan(plan);
              setPlanId(plan);
            }}
          >
            {plans.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id}
              </option>
            ))}
          </select>
        </label>
      </section>
      <p>{`Known tenants: ${catalog.length}`}</p>
      <AutomationCommandBoard
        commands={commands.length > 0 ? commands : defaultCommands(viewModel.commands)}
        onToggle={onToggleCommand}
        onRun={onRunCommand}
      />
      <AutomationPulseTimeline runId={run?.id} metrics={viewModel.metrics} />
      <section className="automation-footer">
        <button type="button" onClick={() => void execute()} disabled={isBusy}>
          {isBusy ? 'Running...' : 'Execute plan'}
        </button>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
        {run ? <pre>{JSON.stringify(run, null, 2)}</pre> : null}
      </section>
    </main>
  );
};
