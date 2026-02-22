import { useCallback, useMemo } from 'react';
import { useRecoveryCommandCenter } from '../hooks/useRecoveryCommandCenter';
import { CommandPlanMatrix } from '../components/command-plan/CommandPlanMatrix';
import { CommandTimeline } from '../components/command-center/CommandTimeline';
import { CommandDependencyPanel } from '../components/command-plan/CommandDependencyPanel';
import { CommandControlStrip } from '../components/command-center/CommandControlStrip';

export const RecoveryCommandCenterPage = () => {
  const {
    state,
    setTenant,
    setWindowMinutes,
    setIncludeBlocked,
    runDraft,
    runExecute,
    reset,
  } = useRecoveryCommandCenter();

  const summaryText = useMemo(() => {
    return state.draft ? `risk ${state.draft.plan.totalRisk.toFixed(1)} / coverage ${state.draft.plan.coverage.toFixed(1)}` : 'no plan';
  }, [state.draft]);

  const tenantOptions = useMemo(() => ['tenant-a', 'tenant-b', 'tenant-c', 'tenant-ops'], []);

  const onTenantShift = useCallback((value: string) => {
    const next = value.includes('tenant-') ? value : tenantOptions[Math.floor(Math.random() * tenantOptions.length)];
    setTenant(next);
  }, [setTenant, tenantOptions]);

  return (
    <main className="recovery-command-center-page">
      <header>
        <h1>Recovery Command Center</h1>
        <p>{summaryText}</p>
        <button onClick={reset}>Reset workspace</button>
      </header>

      {state.lastError ? (
        <section className="command-error-banner">
          <h3>Workspace error</h3>
          <p>{state.lastError}</p>
        </section>
      ) : null}

      <CommandControlStrip
        tenantId={state.filter.tenantId}
        windowMinutes={state.filter.windowMinutes}
        includeBlocked={state.filter.includeBlocked}
        loading={state.loading}
        onWindowChange={setWindowMinutes}
        onTenantChange={setTenant}
        onIncludeBlocked={setIncludeBlocked}
        onDraft={runDraft}
        onExecute={() => {
          void runExecute(false);
        }}
      />

      <section className="command-summary-strip">
        <p>Commands: {state.commandCount}</p>
        <p>Logs: {state.logs.length}</p>
        <p>Simulation notes: {state.simulationLines.length}</p>
        <p>Execution: {state.execution?.ok ? 'completed' : 'idle'}</p>
      </section>

      <CommandPlanMatrix draft={state.draft} onRefreshPlan={() => {
        void runDraft();
      }} />

      <CommandTimeline
        filter={state.filter}
        selectedCommandCount={state.commandCount}
        onTenantShift={onTenantShift}
      />

      <CommandDependencyPanel
        commandSummaries={
          state.draft
            ? state.draft.candidates.map((candidate) => ({
                tenantId: state.filter.tenantId,
                ok: candidate.blockedReasonCount === 0,
                runId: candidate.command.id,
                status: candidate.blockedReasonCount === 0 ? ('planned' as const) : ('blocked' as const),
                decisionCount: Math.round(candidate.score),
                topActionType: candidate.command.priority,
                conflictCount: candidate.blockedReasonCount,
                policyNames: [candidate.command.title],
              }))
            : []
        }
        onReorder={(id) => {
          void runExecute(true);
          setTenant(`${id}-${state.filter.tenantId}`);
        }}
      />

      <section className="simulation-lines">
        <h3>Simulation trace</h3>
        <ul>
          {state.simulationLines.map((line) => (
            <li key={`${line}-${Math.random()}`}>{line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
