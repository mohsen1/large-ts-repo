import { ok, fail } from '@shared/result';
import type { Result } from '@shared/result';
import { InMemoryIncidentCommandStore, type IncidentCommandRepository } from '@data/incident-command-store';
import {
  type OrchestrationCommandInput,
  type ExecutionInput,
  type ExecutionStatus,
  type OrchestrationRunId,
  type SimulationInput,
  type SimulationRun,
} from './types';
import { CommandPlanner } from './planner';
import { scorePlan, summarizeSimulationRun } from './evaluator';

const nowId = (tenantId: string): OrchestrationRunId =>
  `${tenantId}:${Date.now()}` as OrchestrationRunId;

export class RecoveryIncidentCommandOrchestrator {
  private readonly planner: CommandPlanner;

  constructor(
    private readonly tenantId: string,
    private readonly requestedBy: string,
    private readonly commandStore: IncidentCommandRepository = new InMemoryIncidentCommandStore(),
  ) {
    this.planner = new CommandPlanner(tenantId, requestedBy);
  }

  static create(tenantId: string, requestedBy = 'system'): RecoveryIncidentCommandOrchestrator {
    return new RecoveryIncidentCommandOrchestrator(tenantId, requestedBy);
  }

  async draft(input: OrchestrationCommandInput) {
    const result = this.planner.createDraft(input);
    if (!result.ok) {
      return fail(result.error);
    }

    const quality = scorePlan(result.value);
    return ok({
      draft: result.value,
      quality,
    });
  }

  async simulate(input: SimulationInput): Promise<Result<SimulationRun, Error>> {
    return this.planner.simulate(input);
  }

  async execute(input: ExecutionInput): Promise<Result<ExecutionStatus, Error>> {
    if (!input.force && input.commandIds.length === 0) {
      return fail(new Error('execution rejected: no commands selected'));
    }

    const commandRecords = await this.commandStore.listCommands({ tenantId: input.tenantId, limit: 400 });
    if (!commandRecords.ok) {
      return fail(new Error('execution source unavailable'));
    }

    const matchedCommands = commandRecords.value.filter((record) =>
      input.commandIds.length === 0 || input.commandIds.includes(record.command.id),
    );

    const details = [
      `plan=${input.planId}`,
      `commands=${matchedCommands.length}`,
      `tenant=${input.tenantId}`,
      `force=${String(input.force)}`,
      `actor=${input.planId}`,
    ];

    return ok({
      runId: nowId(input.tenantId),
      executedAt: new Date().toISOString(),
      ok: true,
      details,
    });
  }

  async storeExecutionArtifacts(input: OrchestrationCommandInput) {
    const commands = await this.commandStore.listCommands({ tenantId: input.tenantId, limit: 100 });
    if (!commands.ok) {
      return fail(new Error('artifact store unavailable'));
    }

    for (const row of commands.value) {
      await this.commandStore.addExecution(row.command, 'planned', [], input.tenantId);
    }

    return ok({
      count: commands.value.length,
      tenantId: input.tenantId,
      insertedBy: this.requestedBy,
    });
  }

  async simulateAndAnnotate(input: SimulationInput): Promise<Result<readonly string[], Error>> {
    const simulation = await this.simulate(input);
    if (!simulation.ok) {
      return fail(simulation.error);
    }

    const context = {
      tenantId: input.tenantId,
      runId: `${input.tenantId}-annotation-${Date.now()}` as OrchestrationRunId,
      now: new Date().toISOString(),
      requestedBy: this.requestedBy,
    };

    return ok(summarizeSimulationRun(context, simulation.value));
  }
}
