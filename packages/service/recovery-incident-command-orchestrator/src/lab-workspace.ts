import type { RecoveryCommand, CommandWindow } from '@domain/incident-command-models';
import { CommandStatus } from '@domain/incident-command-models';
import {
  makeWorkspaceId,
  makeSessionId,
  type CommandLabSession,
  type CommandLabWorkspace,
  type CommandLabWorkspaceId,
  parseCommandLabSessionInput,
} from '@domain/incident-command-models/lab-workflow-model';
import { InMemoryCommandLabRecordStore, type CommandLabRecord } from '@data/incident-command-store';
import { InMemoryIncidentCommandStore } from '@data/incident-command-store';
import { CommandLabTelemetry } from './lab-telemetry';
import { RecoveryIncidentCommandLabFacade, type CommandLabFacadeInput } from './lab-adapter';
import { ok, fail } from '@shared/result';
import type { Result } from '@shared/result';

export interface CommandLabWorkspaceState {
  readonly workspace: CommandLabWorkspace;
  readonly records: readonly string[];
  readonly events: readonly string[];
}

const sessionFromFacadeInput = (tenantId: string, input: CommandLabFacadeInput): CommandLabSession => {
  const parsed = parseCommandLabSessionInput({
    tenantId: input.tenantId,
    label: 'command-lab-session',
    commandIds: input.commands.map((command) => command.id),
    targetWindowMinutes: input.windowMinutes,
    requestedBy: input.requestedBy,
  });
  return {
    id: makeSessionId(`workspace:${tenantId}`),
    workspaceId: parsed.workspaceId,
    tenantId,
    runBy: input.requestedBy,
    targetWindowMinutes: parsed.targetWindowMinutes,
    commands: input.commands,
    queuedCommands: input.commands.map((command) => command.id),
    blockedCommands: [],
    stepStates: [],
  };
};

const nowWorkspace = (tenantId: string): CommandLabWorkspace => {
  const id = makeWorkspaceId(tenantId);
  return {
    id,
    tenantId,
    label: `Command lab workspace ${tenantId}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sessions: [],
    sessionsByState: {
      planned: 0,
      running: 0,
      completed: 0,
      blocked: 0,
      queued: 0,
      simulated: 0,
      failed: 0,
    },
  };
};

const updateStateCount = (
  current: CommandLabWorkspace['sessionsByState'],
  from: CommandStatus,
  to: CommandStatus,
): CommandLabWorkspace['sessionsByState'] => ({
  ...current,
  [from]: Math.max(0, current[from] - 1),
  [to]: current[to] + 1,
});

const mapStatusToBucket = (status: string): CommandStatus => {
  if (status === 'running') return 'running';
  if (status === 'completed') return 'completed';
  if (status === 'stable' || status === 'queued') return 'queued';
  return 'planned';
};

export class CommandLabWorkspaceService {
  private workspace: CommandLabWorkspace;
  private readonly facade: RecoveryIncidentCommandLabFacade;
  private readonly store = new InMemoryCommandLabRecordStore();
  private readonly commandStore = new InMemoryIncidentCommandStore();
  private readonly telemetry = new CommandLabTelemetry();
  private readonly events: string[] = [];
  private readonly workspaceId: CommandLabWorkspaceId;

  constructor(private readonly tenantId: string, requestedBy = 'operator') {
    this.workspace = nowWorkspace(tenantId);
    this.workspaceId = this.workspace.id;
    this.facade = RecoveryIncidentCommandLabFacade.create(tenantId, requestedBy);
  }

  async hydrate(commands: readonly RecoveryCommand[]): Promise<Result<CommandLabWorkspaceState, Error>> {
    const seeded = await this.commandStore.listCommands({ tenantId: this.tenantId, limit: 250 });
    if (!seeded.ok) {
      return fail(seeded.error);
    }

    if (seeded.value.length < commands.length) {
      for (const command of commands) {
        await this.commandStore.addCommand(command, this.tenantId);
      }
    }

    const hydrated = await this.store.hydrateFromRepository(this.tenantId, this.commandStore);
    if (!hydrated.ok) {
      return fail(hydrated.error);
    }

    for (const command of commands) {
      const session = sessionFromFacadeInput(this.tenantId, {
        tenantId: this.tenantId,
        requestedBy: 'operator',
        commands: [command],
        windowMinutes: 20,
      });
      this.workspace = {
        ...this.workspace,
        sessions: [...this.workspace.sessions, session],
        sessionsByState: updateStateCount(this.workspace.sessionsByState, 'planned', 'queued'),
        updatedAt: new Date().toISOString(),
      };
      this.events.push(`hydrated:${command.id}`);
      await this.telemetry.trackCreate(
        {
          tenantId: this.tenantId,
          planId: session.id,
          commandIds: session.queuedCommands.map((id) => String(id)),
        },
        session.commands,
      );
    }

    return this.snapshot();
  }

  async addDraft(input: CommandLabFacadeInput): Promise<Result<CommandLabWorkspaceState, Error>> {
    const draft = await this.facade.draft(input);
    if (!draft.ok) {
      return fail(draft.error);
    }

    const commandRecordIds = draft.value.records.map((record) => record.id);
    const session = sessionFromFacadeInput(this.tenantId, input);
    const byStatus = mapStatusToBucket(draft.value.records[0]?.status ?? 'queued');
    this.workspace = {
      ...this.workspace,
      sessions: [...this.workspace.sessions, session],
      sessionsByState: {
        ...this.workspace.sessionsByState,
        [byStatus]: this.workspace.sessionsByState[byStatus] + 1,
      },
      updatedAt: new Date().toISOString(),
    };

    await this.telemetry.trackAnnotate(
      { tenantId: this.tenantId, planId: draft.value.plan.id, commandIds: input.commands.map((command) => command.id) },
      draft.value.plan.blockedReasons,
    );
    this.events.push(`plan:${draft.value.plan.id}:records=${commandRecordIds.length}`);
    return this.snapshot();
  }

  async execute(planId: string, commandIds: readonly string[]): Promise<Result<CommandLabWorkspaceState, Error>> {
    const executed = await this.facade.execute(planId, commandIds);
    if (!executed.ok) {
      return fail(executed.error);
    }

    this.workspace = {
      ...this.workspace,
      sessionsByState: {
        ...this.workspace.sessionsByState,
        completed: this.workspace.sessionsByState.completed + 1,
      },
      updatedAt: new Date().toISOString(),
    };
    await this.telemetry.trackExecute({ tenantId: this.tenantId, planId, commandIds }, commandIds);
    this.events.push(`execute:${planId}`);

    const list = await this.store.listByTenant(this.tenantId);
    if (!list.ok) {
      return fail(list.error);
    }
    return this.snapshot();
  }

  async snapshot(): Promise<Result<CommandLabWorkspaceState, Error>> {
    const records = await this.store.listByTenant(this.tenantId);
    if (!records.ok) {
      return fail(records.error);
    }
    const ids = records.value.map((record) => record.id);
    const recordWindows = records.value
      .filter((record): record is CommandLabRecord => typeof record.command.id === 'string')
      .map(() => 0);
    if (recordWindows.length > 0) {
      this.workspace = {
        ...this.workspace,
        sessions: this.workspace.sessions,
        updatedAt: new Date().toISOString(),
      };
    }
    return ok({
      workspace: this.workspace,
      records: ids,
      events: this.events.slice(-20),
    });
  }

  getWorkspaceId(): CommandLabWorkspaceId {
    return this.workspaceId;
  }

  listKnownWindows(): readonly CommandWindow[] {
    return this.workspace.sessions.flatMap((session) =>
      session.commands.map((command) => ({
        id: command.window.id,
        startsAt: command.window.startsAt,
        endsAt: command.window.endsAt,
        preferredClass: command.window.preferredClass,
        maxConcurrent: command.window.maxConcurrent,
      })),
    );
  }

  async persistRecords(records: readonly CommandLabRecord[]): Promise<Result<readonly string[], Error>> {
    for (const record of records) {
      this.events.push(`record:${record.id}`);
    }
    return ok(records.map((record) => record.id));
  }
}
