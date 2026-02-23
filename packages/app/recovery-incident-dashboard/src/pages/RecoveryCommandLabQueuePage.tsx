import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useCommandLabFilters } from '../hooks/useCommandLabFilters';
import type { CommandLabCommandTile, CommandLabFilterMode } from '../types/recoveryCommandLab';
import { useCommandLabWorkspace } from '../hooks/useCommandLabWorkspace';
import { CommandLabPlanBoard } from '../components/command-lab/CommandLabPlanBoard';
import type { RecoveryCommand } from '@domain/incident-command-models';

const commandSeed: readonly RecoveryCommand[] = Array.from({ length: 5 }).map((_, index) => ({
  id: `queue-${index}` as RecoveryCommand['id'],
  title: `queued-${index}`,
  description: 'queued command',
  ownerTeam: 'queue',
  priority: 'medium',
  window: {
    id: `${index}-queue-window` as RecoveryCommand['window']['id'],
    startsAt: new Date(Date.now() + 300_000).toISOString(),
    endsAt: new Date(Date.now() + 360_000).toISOString(),
    preferredClass: 'network',
    maxConcurrent: 1,
  },
  affectedResources: ['network', 'database'],
  dependencies: [],
  prerequisites: ['ready'],
  constraints: [],
  expectedRunMinutes: 12,
  riskWeight: 0.19,
  runbook: ['prepare', 'validate'],
  runMode: 'full' as const,
  retryWindowMinutes: 2,
}));

const toCommandTile = (commands: readonly RecoveryCommand[]): readonly CommandLabCommandTile[] =>
  commands.map((command) => ({
    commandId: command.id,
    title: command.title,
    owner: command.ownerTeam,
    riskScore: command.riskWeight,
    state: 'queued',
  }));

export const RecoveryCommandLabQueuePage = (): ReactElement => {
  const tenantId = 'tenant-lab-queue';
  const { workspace, loading, draftPlan, executePlan, panelState } = useCommandLabWorkspace({ tenantId, commands: commandSeed });
  const [search, setSearch] = useState('');
  const [current, setCurrent] = useState<CommandLabFilterMode>('all');

  const [mode, view] = useCommandLabFilters({
    records: toCommandTile(commandSeed),
    search,
  });
  const commandTiles = useMemo(() => view.filtered, [view.filtered]);

  useEffect(() => {
    setCurrent(mode);
  }, [mode]);

  const onDraft = useCallback(() => {
    void draftPlan();
  }, [draftPlan]);

  const onExecute = useCallback(() => {
    void executePlan();
  }, [executePlan]);

  return (
    <div className="recovery-command-lab-queue-page">
      <h1>Recovery Command Lab Queue</h1>
      <p>{`tenant=${tenantId} filter=${current}`}</p>
      <input
        type="text"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        placeholder="search queued command"
      />
      <section>
        <button type="button" onClick={() => view.setMode('queued')}>
          show queued
        </button>
        <button type="button" onClick={() => view.setMode('critical')}>
          show critical
        </button>
      </section>
      <section>
        <button type="button" onClick={onDraft}>
          create draft plan
        </button>
        <button type="button" onClick={onExecute} disabled={loading}>
          execute draft
        </button>
      </section>
      <section>
        <p>{`records=${panelState.records.length}`}</p>
        <CommandLabPlanBoard workspace={workspace} commandTiles={commandTiles} loading={loading} />
      </section>
    </div>
  );
};
