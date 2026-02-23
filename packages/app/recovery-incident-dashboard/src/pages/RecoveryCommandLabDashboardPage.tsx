import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { CommandLabPlanBoard } from '../components/command-lab/CommandLabPlanBoard';
import { CommandLabPlanCard } from '../components/command-lab/CommandLabPlanCard';
import { CommandLabRunline } from '../components/command-lab/CommandLabRunline';
import { useCommandLabWorkspace } from '../hooks/useCommandLabWorkspace';
import type { CommandLabCommandTile } from '../types/recoveryCommandLab';
import { buildExecutionPlan } from '@domain/incident-command-models';
import type { RecoveryCommand } from '@domain/incident-command-models';
import { buildLabObjectiveInput } from '@domain/incident-command-models';

const buildCommand = (index: number): RecoveryCommand => ({
  id: `dash-${index}` as RecoveryCommand['id'],
  title: `dashboard-${index}`,
  description: 'dashboard seed',
  ownerTeam: 'dashboard',
  priority: 'low',
  window: {
    id: `${index}-dashboard-window` as RecoveryCommand['window']['id'],
    startsAt: new Date(Date.now() + index * 12_000).toISOString(),
    endsAt: new Date(Date.now() + index * 15_000).toLocaleString(),
    preferredClass: 'storage',
    maxConcurrent: 1,
  },
  affectedResources: ['storage'],
  dependencies: [],
  prerequisites: [],
  constraints: [
    {
      id: `${index}-dashboard-constraint` as RecoveryCommand['constraints'][number]['id'],
      commandId: `dash-${index}` as RecoveryCommand['id'],
      reason: `seed-${index}`,
      hard: false,
      tags: ['dashboard'],
    },
  ],
  expectedRunMinutes: 8,
  riskWeight: 0.1 + index * 0.02,
  runbook: ['collect'],
  runMode: 'shadow' as const,
  retryWindowMinutes: 3,
});

export const RecoveryCommandLabDashboardPage = (): ReactElement => {
  const tenantId = 'tenant-lab-dashboard';
  const commands = useMemo(() => [...Array.from({ length: 8 })].map((_, index) => buildCommand(index)), []);
  const { workspace, loading, errorMessage, panelState, draftPlan } = useCommandLabWorkspace({
    tenantId,
    commands,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const plan = useMemo(
    () =>
      buildExecutionPlan(
        tenantId,
        `dashboard:${tenantId}`,
        commands.slice(0, activeIndex + 1),
      ),
    [activeIndex, commands, tenantId],
  );
  const tiles = useMemo<readonly CommandLabCommandTile[]>(
    () =>
      commands.map((command) => ({
        commandId: command.id,
        title: command.title,
        owner: command.ownerTeam,
        riskScore: command.riskWeight,
        state: 'queued',
      })),
    [commands],
  );

  return (
    <section className="recovery-command-lab-dashboard-page">
      <h1>Command Lab Dashboard</h1>
      <p>{`tenant=${tenantId} activeIndex=${activeIndex}`}</p>
      <article>
        <button type="button" onClick={draftPlan}>
          refresh plan
        </button>
        <button type="button" onClick={() => setActiveIndex((value) => (value + 1) % commands.length)}>
          advance command
        </button>
      </article>
      <CommandLabPlanCard plan={plan} onRun={() => setActiveIndex((value) => (value + 2) % commands.length)} />
      <CommandLabRunline items={tiles} />
      <CommandLabPlanBoard workspace={workspace} commandTiles={tiles} loading={loading} />
      <section>
        <h3>Profile input</h3>
        <pre>{JSON.stringify(buildLabObjectiveInput(tenantId, {
          tenantId,
          commandId: commands[0] ? String(commands[0].id) : 'none',
          label: 'dashboard',
          targetResource: 'storage',
          desiredThroughput: 42,
          maxDowntimeMinutes: 13,
          confidence: 0.91,
        } as any), null, 2)}</pre>
      </section>
      <section>
        <p>{`loading=${loading}`}</p>
        <p>{`records=${panelState.records.length}`}</p>
        {errorMessage ? <p>{errorMessage}</p> : null}
      </section>
    </section>
  );
};
