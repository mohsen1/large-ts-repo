import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useCommandLabWorkspace } from '../hooks/useCommandLabWorkspace';
import { useCommandLabFilters } from '../hooks/useCommandLabFilters';
import { useCommandLabEvents } from '../hooks/useCommandLabEvents';
import { CommandLabPlanBoard } from '../components/command-lab/CommandLabPlanBoard';
import { CommandLabPlanCard } from '../components/command-lab/CommandLabPlanCard';
import { buildCommandPlanId } from '@domain/incident-command-models';
import { buildExecutionPlan } from '@domain/incident-command-models';
import type { RecoveryCommand } from '@domain/incident-command-models';
import type { CommandLabCommandTile } from '../types/recoveryCommandLab';
import type { CommandLabExecutionPlan } from '@domain/incident-command-models';

const syntheticCommands = Array.from({ length: 10 }).map((_, index) => ({
  id: `${index}` as RecoveryCommand['id'],
  title: `Recovery command ${index + 1}`,
  description: 'Synthetic for lab',
  ownerTeam: 'lab',
  priority: 'high' as const,
  window: {
    id: `${index}-orchestrator-window` as RecoveryCommand['window']['id'],
    startsAt: new Date(Date.now() + index * 60_000).toISOString(),
    endsAt: new Date(Date.now() + (index + 2) * 60_000).toISOString(),
    preferredClass: 'compute',
    maxConcurrent: 2,
  },
  affectedResources: ['compute'],
  dependencies: [],
  prerequisites: [],
  constraints: [],
  expectedRunMinutes: 10 + index,
  riskWeight: (index % 10) / 10,
  runbook: ['stage', 'execute', 'cleanup'],
  runMode: 'canary' as const,
  retryWindowMinutes: 5,
})) as readonly RecoveryCommand[];

export const RecoveryCommandLabOrchestratorPage = (): ReactElement => {
  const tenantId = 'tenant-lab-orchestrator';
  const [search, setSearch] = useState('');
  const { workspace, loading, errorMessage, draftPlan, executePlan, panelState } = useCommandLabWorkspace({
    tenantId,
    commands: syntheticCommands,
  });

  const commandTiles = useMemo<readonly CommandLabCommandTile[]>(
    () =>
      syntheticCommands.map((command) => ({
        commandId: command.id,
        title: command.title,
        owner: command.ownerTeam,
        riskScore: command.riskWeight,
        state: command.riskWeight > 0.7 ? 'critical' : command.riskWeight > 0.4 ? 'running' : 'queued',
      })),
    [workspace],
  );
  const executionPlan = useMemo<CommandLabExecutionPlan>(() => buildExecutionPlan(tenantId, `plan-${tenantId}`, syntheticCommands), [tenantId]);

  const [mode, { filtered, setMode }] = useCommandLabFilters({
    records: commandTiles,
    search,
  });

  const { events } = useCommandLabEvents(tenantId);

  return (
    <article className="recovery-command-lab-orchestrator-page">
      <header>
        <h1>Recovery Command Lab Orchestrator</h1>
        <p>Plan id preview: {buildCommandPlanId(tenantId)}</p>
      </header>
      <section>
        <label htmlFor="command-lab-search">Search commands</label>
        <input
          id="command-lab-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="command id or title"
        />
      </section>
      <section>
        <button type="button" onClick={() => setMode('all')}>
          all
        </button>
        <button type="button" onClick={() => setMode('queued')}>
          queued
        </button>
        <button type="button" onClick={() => setMode('running')}>
          running
        </button>
        <button type="button" onClick={() => setMode('critical')}>
          critical
        </button>
      </section>
      <section>
        <CommandLabPlanCard
          plan={workspace ? executionPlan : null}
          onRun={draftPlan}
        />
      </section>
      <section>
        <button type="button" onClick={executePlan} disabled={loading || filtered.length === 0}>
          execute
        </button>
      </section>
      <CommandLabPlanBoard workspace={workspace} commandTiles={filtered} loading={loading} />
      <section>
        <h4>Mode</h4>
        <p>{mode}</p>
      </section>
      <section>
        <h4>Panel state</h4>
        <p>{`loading=${panelState.loading}, records=${panelState.records.length}`}</p>
        {errorMessage ? <p>{errorMessage}</p> : null}
      </section>
      <section>
        <h4>Telemetry</h4>
        <ul>
          {events.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </section>
    </article>
  );
};
