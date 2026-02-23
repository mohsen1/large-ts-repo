import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';
import { z } from 'zod';
import type { CommandDefinition, CommandPlan, CommandStatus } from '@domain/incident-command-models';
import type { CommandStoreFilters } from './types';
import type { IncidentCommandRepository } from './repository';

export type CommandLabRecordStatus = 'queued' | 'running' | 'stable' | 'critical' | 'slow';

export interface CommandLabArtifact {
  readonly key: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface CommandLabRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly command: CommandDefinition;
  readonly status: CommandLabRecordStatus;
  readonly planId?: CommandPlan['id'];
  readonly lastRunStatus?: CommandStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly riskScore: number;
  readonly expectedRunMinutes: number;
  readonly artifacts: readonly CommandLabArtifact[];
}

const commandLabRecordSchema = z.object({
  id: z.string().trim().min(1),
  tenantId: z.string().trim().min(1),
  status: z.union([
    z.literal('queued'),
    z.literal('running'),
    z.literal('stable'),
    z.literal('critical'),
    z.literal('slow'),
  ]),
  planId: z
    .string()
    .trim()
    .optional(),
  lastRunStatus: z
    .enum(['planned', 'queued', 'running', 'blocked', 'completed', 'failed'])
    .optional(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  riskScore: z.number().finite(),
  expectedRunMinutes: z.number().finite().nonnegative(),
  artifacts: z.array(
    z.object({
      key: z.string().trim().min(1),
      mimeType: z.string().trim().min(1),
      sizeBytes: z.number().finite().nonnegative(),
    }),
  ),
});

interface CommandLabState {
  records: Map<string, CommandLabRecord>;
}

const createState = (): CommandLabState => ({ records: new Map<string, CommandLabRecord>() });

const defaultArtifact = (commandId: string): CommandLabArtifact => ({
  key: `lab/${commandId}/metadata.json`,
  mimeType: 'application/json',
  sizeBytes: 128,
});

const inferStatus = (command: CommandDefinition): CommandLabRecordStatus => {
  if (command.riskWeight >= 0.8) {
    return 'critical';
  }
  if (command.expectedRunMinutes >= 45) {
    return 'slow';
  }
  if (command.riskWeight >= 0.4) {
    return 'running';
  }
  return 'stable';
};

export class InMemoryCommandLabRecordStore {
  private readonly state = createState();

  async upsertRecord(
    tenantId: string,
    command: CommandDefinition,
    plan?: CommandPlan,
    statusOverride?: CommandLabRecordStatus,
  ): Promise<Result<CommandLabRecord>> {
    try {
      const now = new Date().toISOString();
      const status = statusOverride ?? inferStatus(command);
      const recordId = `${tenantId}:lab:${command.id}` as string;
      const record: CommandLabRecord = {
        id: recordId,
        tenantId,
        command,
        status,
        planId: plan?.id,
        lastRunStatus: plan ? 'queued' : undefined,
        createdAt: now,
        updatedAt: now,
        riskScore: command.riskWeight,
        expectedRunMinutes: command.expectedRunMinutes,
        artifacts: [defaultArtifact(String(command.id))],
      };
      const parsed = commandLabRecordSchema.parse(record) as unknown as CommandLabRecord;
      this.state.records.set(recordId, parsed);
      return ok(parsed);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('failed to upsert lab record'));
    }
  }

  async listByTenant(tenantId: string, filters: CommandStoreFilters = {}): Promise<Result<readonly CommandLabRecord[]>> {
    try {
      const results = [...this.state.records.values()]
        .filter((record) => record.tenantId === tenantId)
        .filter((record) => (filters.status ? record.status === filters.status : true))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, filters.limit ?? 100);
      return ok(results);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('failed to list records'));
    }
  }

  async hydrateFromRepository(
    tenantId: string,
    repo: IncidentCommandRepository,
  ): Promise<Result<readonly CommandLabRecord[]>> {
    try {
      const commands = await repo.listCommands({ tenantId, limit: 250 } as CommandStoreFilters);
      if (!commands.ok) {
        return fail(commands.error);
      }
      const records: CommandLabRecord[] = [];
      for (const command of commands.value) {
        const upserted = await this.upsertRecord(tenantId, command.command);
        if (!upserted.ok) {
          continue;
        }
        records.push(upserted.value);
      }
      return ok(records);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('failed to hydrate records'));
    }
  }
}

export const buildCommandLabRecord = (
  tenantId: string,
  command: CommandDefinition,
  statusOverride?: CommandLabRecordStatus,
): Result<CommandLabRecord> => {
  const record: CommandLabRecord = {
    id: `${tenantId}:lab:${command.id}:${Date.now()}`,
    tenantId,
    command,
    status: statusOverride ?? inferStatus(command),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    riskScore: command.riskWeight,
    expectedRunMinutes: command.expectedRunMinutes,
    artifacts: [defaultArtifact(String(command.id))],
  };
  try {
    return ok(commandLabRecordSchema.parse(record) as unknown as CommandLabRecord);
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('invalid lab record'));
  }
};

export const mergeRunArtifacts = (
  base: readonly CommandLabArtifact[],
  additions: readonly CommandLabArtifact[],
): readonly CommandLabArtifact[] => {
  const byKey = new Map<string, CommandLabArtifact>();
  for (const item of [...base, ...additions]) {
    byKey.set(item.key, item);
  }
  return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
};
