import type { RecoveryCommand, CommandPlan, CommandWindow } from '@domain/incident-command-models';
import type { CommandLabExecutionPlan } from '@domain/incident-command-models';
import type { CommandLabRecord } from '@data/incident-command-store';

export type CommandLabFilterMode = 'all' | 'critical' | 'queued' | 'running';

export interface CommandLabWorkspace {
  readonly id: string;
  readonly tenantId: string;
  readonly label: string;
  readonly sessions: readonly CommandLabSession[];
  readonly events: readonly string[];
}

export interface CommandLabSession {
  readonly id: string;
  readonly tenantId: string;
  readonly runBy: string;
  readonly targetWindowMinutes: number;
  readonly commands: readonly RecoveryCommand[];
  readonly queuedCommands: readonly RecoveryCommand['id'][];
  readonly blockedCommands: readonly RecoveryCommand['id'][];
  readonly commandWindows: readonly CommandWindow[];
}

export interface CommandLabPanelState {
  readonly loading: boolean;
  readonly errorMessage: string | null;
  readonly plan: CommandPlan | null;
  readonly executionPlan: CommandLabExecutionPlan | null;
  readonly records: readonly CommandLabRecord[];
  readonly filterMode: CommandLabFilterMode;
}

export interface CommandLabDraftInput {
  readonly tenantId: string;
  readonly requestedBy: string;
  readonly commands: readonly RecoveryCommand[];
  readonly windowMinutes: number;
}

export interface CommandLabCommandTile {
  readonly commandId: string;
  readonly title: string;
  readonly owner: string;
  readonly riskScore: number;
  readonly state: 'queued' | 'running' | 'stable' | 'critical' | 'slow';
}
