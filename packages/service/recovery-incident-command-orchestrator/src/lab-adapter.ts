import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { RecoveryCommand, CommandPlan } from '@domain/incident-command-models';
import type { CommandLabRecord, CommandLabRecordStatus } from '@data/incident-command-store';
import { InMemoryCommandLabRecordStore, buildCommandLabRecord } from '@data/incident-command-store/lab-records';
import type { CommandTemplateOptions } from '@domain/incident-command-core';
import { CommandLabOrchestrator } from './command-lab';
import type { ExecutionInput } from './types';

export interface CommandLabFacadeInput {
  readonly tenantId: string;
  readonly requestedBy: string;
  readonly commands: readonly RecoveryCommand[];
  readonly windowMinutes: number;
}

export interface CommandLabFacadeResult {
  readonly tenantId: string;
  readonly plan: CommandPlan;
  readonly records: readonly CommandLabRecord[];
}

const withStatus = (status: CommandLabRecordStatus): CommandLabRecordStatus => status;
const buildFallbackPlan = (tenantId: string, planId: string, commandCount: number): CommandPlan => ({
  id: planId as CommandPlan['id'],
  tenantId,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  requestedBy: 'lab',
  steps: [],
  totalRisk: Math.min(10, commandCount * 0.75),
  coverage: commandCount,
  blockedReasons: [`synthetic-lab-draft:${tenantId}`],
});

const toExecutionInput = (planId: string, tenantId: string, commandIds: readonly string[]): ExecutionInput => ({
  planId: planId as ExecutionInput['planId'],
  tenantId,
  commandIds,
  force: false,
});

export class RecoveryIncidentCommandLabFacade {
  private readonly store = new InMemoryCommandLabRecordStore();
  private readonly orchestrator: CommandLabOrchestrator;

  constructor(private readonly tenantId: string, private readonly requestedBy: string) {
    this.orchestrator = CommandLabOrchestrator.create(this.tenantId, this.requestedBy);
  }

  static create(tenantId: string, requestedBy = 'system'): RecoveryIncidentCommandLabFacade {
    return new RecoveryIncidentCommandLabFacade(tenantId, requestedBy);
  }

  async draft(input: CommandLabFacadeInput): Promise<Result<CommandLabFacadeResult, Error>> {
    const primaryCommand = input.commands[0];
    const templateSeed = primaryCommand ? String(primaryCommand.id) : `tenant-${input.tenantId}`;
    const orchestratorInput: CommandTemplateOptions = {
      includeNotifyOnly: false,
      maxParallelism: 1,
      minimumReadinessScore: 0.2,
      maxRiskScore: 3,
      includeRollbackWindowMinutes: input.windowMinutes,
    };

    const draft = await this.orchestrator.draft(templateSeed, orchestratorInput);
    if (!draft.ok) {
      return fail(draft.error);
    }

    const labRunId = draft.value.runId ?? draft.value.planId ?? draft.value.snapshot ?? input.tenantId;
    const plan = buildFallbackPlan(input.tenantId, String(labRunId), draft.value.candidates.length);

    const commandIndex = new Map<string, RecoveryCommand>(input.commands.map((command) => [String(command.id), command]));
    const records: CommandLabRecord[] = [];
    for (const candidateId of draft.value.candidates) {
      const candidate = commandIndex.get(candidateId);
      if (!candidate) {
        continue;
      }
      const status: CommandLabRecordStatus = plan.coverage > 20 ? 'running' : 'queued';
      const record = buildCommandLabRecord(input.tenantId, candidate, withStatus(status));
      if (!record.ok) {
        return fail(record.error);
      }

      const persisted = await this.store.upsertRecord(input.tenantId, candidate, plan, withStatus(status));
      if (!persisted.ok) {
        return fail(persisted.error);
      }

      const latest = persisted.value;
      records.push(latest);
    }

    return ok({
      tenantId: input.tenantId,
      plan,
      records,
    });
  }

  async execute(planId: string, commandIds: readonly string[]): Promise<Result<CommandLabFacadeResult, Error>> {
    const execution = await this.orchestrator.execute(toExecutionInput(planId, this.tenantId, commandIds));
    if (!execution.ok) {
      return fail(execution.error);
    }

    const records: CommandLabRecord[] = [];
    const list = await this.store.listByTenant(this.tenantId);
    if (!list.ok) {
      return fail(list.error);
    }

    for (const record of list.value) {
      if (commandIds.includes(record.command.id)) {
        const rebuilt = buildCommandLabRecord(this.tenantId, record.command, withStatus('stable'));
        if (!rebuilt.ok) {
          continue;
        }
        records.push(rebuilt.value);
      }
    }

    const fallbackPlan: CommandPlan = {
      id: planId as CommandPlan['id'],
      tenantId: this.tenantId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      requestedBy: this.requestedBy,
      steps: [],
      totalRisk: 0,
      coverage: execution.value.commandIds.length,
      blockedReasons: execution.value.audits,
    };

    return ok({
      tenantId: this.tenantId,
      plan: fallbackPlan,
      records,
    });
  }

  async surface(): Promise<Result<readonly string[], Error>> {
    return this.orchestrator.surfaceState();
  }
}
