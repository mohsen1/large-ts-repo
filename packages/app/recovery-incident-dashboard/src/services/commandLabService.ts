import type { Result } from '@shared/result';
import type { RecoveryCommand, CommandPlan } from '@domain/incident-command-models';
import { CommandLabWorkspaceService, type CommandLabWorkspaceState } from '@service/recovery-incident-command-orchestrator';
import type { CommandLabFacadeInput } from '@service/recovery-incident-command-orchestrator';
import { buildCommandLabRecord, type CommandLabRecord, type CommandLabRecordStatus, type CommandLabArtifact } from '@data/incident-command-store';
import type { CommandLabPanelState, CommandLabFilterMode, CommandLabWorkspace, CommandLabSession } from '../types/recoveryCommandLab';

export interface CommandLabServiceOutput {
  readonly workspace: CommandLabWorkspace;
  readonly panelState: CommandLabPanelState;
}

type CommandLabFacadeResult = CommandPlan | null;

export class CommandLabService {
  private readonly workspaceService: CommandLabWorkspaceService;
  private state: CommandLabPanelState;
  private commandsByTenant = new Map<string, readonly RecoveryCommand[]>();
  private readonly filterOptions: CommandLabFilterMode[] = ['all', 'critical', 'queued', 'running'];

  constructor(
    private readonly tenantId: string,
    private readonly workspaceId: string,
  ) {
    this.workspaceService = new CommandLabWorkspaceService(tenantId);
    this.state = {
      loading: false,
      errorMessage: null,
      plan: null,
      executionPlan: null,
      records: [],
      filterMode: 'all',
    };
  }

  async hydrate(commands: readonly RecoveryCommand[]): Promise<Result<CommandLabServiceOutput, Error>> {
    this.commandsByTenant.set(this.tenantId, commands);
    this.state = { ...this.state, loading: true };

    const seeded = await this.workspaceService.hydrate(commands);
    if (!seeded.ok) {
      this.state = { ...this.state, loading: false, errorMessage: seeded.error.message };
      return seeded;
    }

    const output = this.buildOutput(seeded.value);
    this.state = {
      ...this.state,
      ...output.panelState,
      loading: false,
      errorMessage: output.panelState.errorMessage,
      filterMode: this.state.filterMode,
    };
    return { ...seeded, value: output };
  }

  async draft(input: CommandLabFacadeInput): Promise<Result<CommandLabServiceOutput, Error>> {
    this.state = { ...this.state, loading: true, errorMessage: null };
    const workspace = await this.workspaceService.addDraft(input);
    if (!workspace.ok) {
      this.state = { ...this.state, loading: false, errorMessage: workspace.error.message };
      return workspace;
    }

    const normalized = this.normalizeWorkspace(workspace.value);
    this.state = {
      ...this.state,
      loading: false,
      plan: null,
      executionPlan: null,
      records: normalized.records,
      filterMode: this.state.filterMode,
    };
    return { ok: true, value: normalized };
  }

  async execute(planId: string, commandIds: readonly RecoveryCommand['id'][]): Promise<Result<CommandLabServiceOutput, Error>> {
    this.state = { ...this.state, loading: true, errorMessage: null };
    const workspace = await this.workspaceService.execute(planId, commandIds);
    if (!workspace.ok) {
      this.state = { ...this.state, loading: false, errorMessage: workspace.error.message };
      return workspace;
    }

    const normalized = this.normalizeWorkspace(workspace.value);
    this.state = { ...this.state, loading: false, records: normalized.records, plan: normalized.panelState.plan };
    return { ...workspace, value: normalized };
  }

  getPanelState(): CommandLabPanelState {
    return this.state;
  }

  setFilterMode(mode: CommandLabFilterMode): void {
    this.state = { ...this.state, filterMode: mode };
  }

  getFilterOptions(): readonly CommandLabFilterMode[] {
    return [...this.filterOptions];
  }

  private buildOutput(snapshot: CommandLabWorkspaceState): CommandLabServiceOutput {
    const output = this.normalizeWorkspace(snapshot);
    return {
      workspace: output.workspace,
      panelState: output.panelState,
    };
  }

  private normalizeWorkspace(snapshot: CommandLabWorkspaceState): { workspace: CommandLabWorkspace; panelState: CommandLabPanelState; records: readonly CommandLabRecord[] } {
    const workspace: CommandLabWorkspace = {
      id: snapshot.workspace.id,
      tenantId: snapshot.workspace.tenantId,
      label: `Workspace ${snapshot.workspace.label}`,
      sessions: snapshot.workspace.sessions.map((session) => this.normalizeSession(session, this.commandsByTenant.get(this.tenantId) ?? [])),
      events: snapshot.events,
    };
    const records = this.toRecords(snapshot.records);
    return {
      workspace,
      panelState: {
        loading: false,
        errorMessage: null,
        plan: null,
        executionPlan: null,
        records,
        filterMode: this.state.filterMode,
      },
      records,
    };
  }

  private normalizeSession(session: any, commands: readonly RecoveryCommand[]): CommandLabSession {
    const commandIds = new Set(commands.map((command) => command.id));
    return {
      id: session.id,
      tenantId: this.tenantId,
      runBy: session.runBy,
      targetWindowMinutes: session.targetWindowMinutes,
      commands: session.commands,
      queuedCommands: session.queuedCommands.filter((id: RecoveryCommand['id']) => commandIds.has(id)),
      blockedCommands: session.blockedCommands,
      commandWindows: session.commands.map((command: RecoveryCommand) => command.window),
    };
  }

  private toRecords(recordIds: readonly string[]): CommandLabRecord[] {
    const knownCommandsById = new Map<string, RecoveryCommand>(
      (this.commandsByTenant.get(this.tenantId) ?? []).map((command) => [String(command.id), command]),
    );
      const mkArtifacts = (): readonly CommandLabArtifact[] => [
      {
        key: `record/${this.tenantId}/bootstrap.json`,
        mimeType: 'application/json',
        sizeBytes: 256,
      },
    ];
    const recordStatus = 'queued' as CommandLabRecordStatus;
    return recordIds
      .map((recordId) => knownCommandsById.get(recordId.replace(/^.*?:lab:/, '').replace(/^.*?:?/, '').trim()))
      .filter((command): command is RecoveryCommand => command !== undefined)
      .map((command, index) => {
        const built = buildCommandLabRecord(this.tenantId, command, recordStatus);
        const id = recordIds[index];
        if (!built.ok) {
          return {
            id,
            tenantId: this.tenantId,
            command,
            status: recordStatus,
            planId: undefined,
            lastRunStatus: 'queued',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            riskScore: command.riskWeight,
            expectedRunMinutes: command.expectedRunMinutes,
            artifacts: mkArtifacts(),
          } as CommandLabRecord;
        }
        return {
          ...built.value,
          id,
          artifacts: mkArtifacts(),
        };
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
}
