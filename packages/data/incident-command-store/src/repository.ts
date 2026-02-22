import { ok, fail } from '@shared/result';
import type { Result } from '@shared/result';
import type {
  CommandStoreFilters,
  CommandRecord,
  CommandPlanRecord,
  CommandSimulationRecord,
  CommandExecutionRecord,
  CommandStoreAudit,
  CommandStoreId,
} from './types';
import type { RecoveryCommand, CommandPlan, SimulationResult, CommandDefinition, ExecutionHistory } from '@domain/incident-command-models';

export interface IncidentCommandRepository {
  addCommand(command: RecoveryCommand, tenantId: string): Promise<Result<CommandRecord>>;
  addPlan(plan: CommandPlan, tenantId: string): Promise<Result<CommandPlanRecord>>;
  addSimulation(simulation: SimulationResult, tenantId: string): Promise<Result<CommandSimulationRecord>>;
  addExecution(command: CommandDefinition, status: string, history: ExecutionHistory[], tenantId: string): Promise<Result<CommandExecutionRecord>>;
  upsertCommand(command: RecoveryCommand, tenantId: string): Promise<Result<CommandRecord>>;
  findCommand(commandId: string, tenantId?: string): Promise<Result<CommandRecord | undefined>>;
  listCommands(filters: CommandStoreFilters): Promise<Result<CommandRecord[]>>;
  listPlans(filters: CommandStoreFilters): Promise<Result<CommandPlanRecord[]>>;
  listSimulations(filters: CommandStoreFilters): Promise<Result<CommandSimulationRecord[]>>;
  listExecutions(filters: CommandStoreFilters): Promise<Result<CommandExecutionRecord[]>>;
  appendAudit(record: CommandStoreAudit): void;
  getAuditTrail(tenantId: string): Promise<Result<readonly CommandStoreAudit[]>>;
}

interface InternalState {
  commands: Map<string, CommandRecord>;
  plans: Map<string, CommandPlanRecord>;
  simulations: Map<string, CommandSimulationRecord>;
  executions: Map<string, CommandExecutionRecord>;
  audits: CommandStoreAudit[];
}

const newState = (): InternalState => ({
  commands: new Map<string, CommandRecord>(),
  plans: new Map<string, CommandPlanRecord>(),
  simulations: new Map<string, CommandSimulationRecord>(),
  executions: new Map<string, CommandExecutionRecord>(),
  audits: [],
});

const makeId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const matchesCommand = (record: CommandRecord, filters: CommandStoreFilters): boolean => {
  if (filters.tenantId && record.tenantId !== filters.tenantId) return false;
  if (filters.commandId && record.command.id !== filters.commandId) return false;
  return true;
};

const boundedLimit = (value?: number): number => {
  if (!Number.isFinite(value as number)) return 50;
  if (value === undefined) return 50;
  return Math.min(250, Math.max(1, value));
};

export class InMemoryIncidentCommandStore implements IncidentCommandRepository {
  private readonly state = newState();

  appendAudit(record: CommandStoreAudit): void {
    this.state.audits = [...this.state.audits, record];
  }

  async getAuditTrail(tenantId: string): Promise<Result<readonly CommandStoreAudit[]>> {
    try {
      return ok(this.state.audits.filter((record) => record.commandStoreId.startsWith(`tenant:${tenantId}:`) || record.note.includes(tenantId)));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('audit failed'));
    }
  }

  async addCommand(command: RecoveryCommand, tenantId: string): Promise<Result<CommandRecord>> {
    try {
      const timestamp = new Date().toISOString();
      const id = `${makeId('command')}` as CommandStoreId;
      const record: CommandRecord = {
        id,
        tenantId,
        command,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.state.commands.set(record.id, record);
      this.appendAudit({
        commandStoreId: id,
        createdAt: timestamp,
        action: 'create',
        note: `tenant:${tenantId}:add-command:${command.id}`,
      });
      return ok(record);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('add command failed'));
    }
  }

  async upsertCommand(command: RecoveryCommand, tenantId: string): Promise<Result<CommandRecord>> {
    const existing = await this.findCommand(command.id, tenantId);
    const now = new Date().toISOString();
    if (!existing.ok) return existing;

    if (existing.value) {
      const updated: CommandRecord = {
        ...existing.value,
        command,
        updatedAt: now,
      };
      this.state.commands.set(updated.id, updated);
      this.appendAudit({
        commandStoreId: updated.id,
        createdAt: now,
        action: 'update',
        note: `tenant:${tenantId}:upsert-command:${command.id}`,
      });
      return ok(updated);
    }

    return this.addCommand(command, tenantId);
  }

  async addPlan(plan: CommandPlan, tenantId: string): Promise<Result<CommandPlanRecord>> {
    try {
      const createdAt = new Date().toISOString();
      const id = `${makeId('plan')}` as CommandStoreId;
      const record: CommandPlanRecord = { id, tenantId, plan, createdAt };
      this.state.plans.set(id, record);
      this.appendAudit({ commandStoreId: id, createdAt, action: 'create', note: `tenant:${tenantId}:add-plan:${plan.id}` });
      return ok(record);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('add plan failed'));
    }
  }

  async addSimulation(simulation: SimulationResult, tenantId: string): Promise<Result<CommandSimulationRecord>> {
    try {
      const createdAt = new Date().toISOString();
      const id = `${makeId('simulation')}` as CommandStoreId;
      const record: CommandSimulationRecord = { id, tenantId, simulation, createdAt };
      this.state.simulations.set(id, record);
      this.appendAudit({ commandStoreId: id, createdAt, action: 'create', note: `tenant:${tenantId}:add-simulation:${simulation.commandPlanId}` });
      return ok(record);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('add simulation failed'));
    }
  }

  async addExecution(
    command: CommandDefinition,
    status: string,
    history: ExecutionHistory[],
    tenantId: string,
  ): Promise<Result<CommandExecutionRecord>> {
    try {
      const startedAt = new Date().toISOString();
      const id = `${makeId('execution')}` as CommandStoreId;
      const record: CommandExecutionRecord = {
        id,
        tenantId,
        command,
        status: status as CommandExecutionRecord['status'],
        history,
        startedAt,
      };
      this.state.executions.set(id, record);
      this.appendAudit({
        commandStoreId: id,
        createdAt: startedAt,
        action: 'create',
        note: `tenant:${tenantId}:add-execution:${command.id}`,
      });
      return ok(record);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('add execution failed'));
    }
  }

  async findCommand(commandId: string, tenantId?: string): Promise<Result<CommandRecord | undefined>> {
    try {
      const matches = [...this.state.commands.values()].find((record) =>
        record.command.id === commandId && (!tenantId || record.tenantId === tenantId),
      );
      return ok(matches);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('find command failed'));
    }
  }

  async listCommands(filters: CommandStoreFilters): Promise<Result<CommandRecord[]>> {
    try {
      const list = [...this.state.commands.values()].filter((record) => matchesCommand(record, filters));
      const sorted = list.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      return ok(sorted.slice(0, boundedLimit(filters.limit)));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('list commands failed'));
    }
  }

  async listPlans(filters: CommandStoreFilters): Promise<Result<CommandPlanRecord[]>> {
    try {
      const list = [...this.state.plans.values()].filter((plan) =>
        (!filters.tenantId || plan.tenantId === filters.tenantId) &&
        (!filters.after || plan.createdAt >= filters.after) &&
        (!filters.before || plan.createdAt <= filters.before),
      );
      const sorted = list.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      return ok(sorted.slice(0, boundedLimit(filters.limit)));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('list plans failed'));
    }
  }

  async listSimulations(filters: CommandStoreFilters): Promise<Result<CommandSimulationRecord[]>> {
    try {
      const list = [...this.state.simulations.values()].filter((simulation) => {
        if (filters.tenantId && simulation.tenantId !== filters.tenantId) return false;
        if (filters.after && simulation.createdAt < filters.after) return false;
        if (filters.before && simulation.createdAt > filters.before) return false;
        return true;
      });
      return ok(list.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, boundedLimit(filters.limit)));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('list simulations failed'));
    }
  }

  async listExecutions(filters: CommandStoreFilters): Promise<Result<CommandExecutionRecord[]>> {
    try {
      const list = [...this.state.executions.values()].filter((execution) => {
        if (filters.tenantId && execution.tenantId !== filters.tenantId) return false;
        if (filters.commandId && execution.command.id !== filters.commandId) return false;
        if (filters.status && execution.status !== filters.status) return false;
        return true;
      });
      const sorted = list.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
      return ok(sorted.slice(0, boundedLimit(filters.limit)));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('list executions failed'));
    }
  }
}
