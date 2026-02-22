import type { Brand } from '@shared/core';
import type {
  CommandDefinition,
  RecoveryCommand,
  CommandPlan,
  SimulationResult,
  ExecutionHistory,
  CommandStatus,
} from '@domain/incident-command-models';

export type CommandStoreId = Brand<string, 'CommandStoreId'>;

export interface CommandRecord {
  id: CommandStoreId;
  tenantId: string;
  command: RecoveryCommand;
  createdAt: string;
  updatedAt: string;
}

export interface CommandPlanRecord {
  id: CommandStoreId;
  tenantId: string;
  plan: CommandPlan;
  createdAt: string;
}

export interface CommandSimulationRecord {
  id: CommandStoreId;
  tenantId: string;
  simulation: SimulationResult;
  createdAt: string;
}

export interface CommandExecutionRecord {
  id: CommandStoreId;
  tenantId: string;
  command: CommandDefinition;
  status: CommandStatus;
  history: ExecutionHistory[];
  startedAt: string;
}

export interface CommandStoreFilters {
  tenantId?: string;
  commandId?: string;
  status?: CommandStatus;
  after?: string;
  before?: string;
  limit?: number;
}

export interface CommandStoreAudit {
  commandStoreId: CommandStoreId;
  createdAt: string;
  action: 'create' | 'update' | 'delete' | 'execute';
  note: string;
}
