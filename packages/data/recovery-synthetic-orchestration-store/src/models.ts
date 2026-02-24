import { Brand } from '@shared/core';
import { z } from 'zod';
import {
  syntheticStatuses,
  syntheticPhases,
  syntheticDomain,
  type SyntheticBlueprintId,
  type SyntheticRunId,
  type SyntheticTenantId,
  type SyntheticWorkspaceId,
  type SyntheticPluginId,
  type SyntheticPhase,
  type SyntheticStatus,
} from '@domain/recovery-synthetic-orchestration';

export type StoreEventId = Brand<string, 'SyntheticStoreEventId'>;
export type StorePlanId = Brand<string, 'SyntheticStorePlanId'>;

export const syntheticRunEventSchema = z.object({
  id: z.string().min(4),
  runId: z.string().min(4),
  tenantId: z.string().min(3),
  workspaceId: z.string().min(3),
  phase: z.string(),
  pluginId: z.string().min(2),
  at: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
  message: z.string().optional(),
});

export const syntheticRunSnapshotSchema = z.object({
  runId: z.string().min(4),
  tenantId: z.string().min(3),
  workspaceId: z.string().min(3),
  timestamp: z.string().datetime(),
  payload: z.unknown(),
});

export const syntheticQuerySchema = z.object({
  tenantId: z.string().min(3).optional(),
  workspaceId: z.string().min(3).optional(),
  status: z.enum(syntheticStatuses as unknown as readonly [string, ...string[]]).optional(),
  phase: z.string().optional(),
  pluginId: z.string().optional(),
  limit: z.number().int().nonnegative().optional(),
  cursor: z.string().optional(),
});

export type SyntheticRunRecordStatus = SyntheticStatus;

export interface SyntheticRunRecord<TPayload = unknown> {
  readonly runId: SyntheticRunId;
  readonly blueprintId: SyntheticBlueprintId;
  readonly tenantId: SyntheticTenantId;
  readonly workspaceId: SyntheticWorkspaceId;
  readonly status: SyntheticRunRecordStatus;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly correlationId: string;
  readonly requestedBy: string;
  readonly priority: string;
  readonly pluginCount: number;
  readonly payload: TPayload;
  readonly phases: readonly SyntheticPhase[];
  readonly warnings: readonly string[];
}

export interface SyntheticRunEvent {
  readonly id: StoreEventId;
  readonly domain: typeof syntheticDomain;
  readonly runId: SyntheticRunId;
  readonly tenantId: SyntheticTenantId;
  readonly workspaceId: SyntheticWorkspaceId;
  readonly phase: SyntheticPhase;
  readonly pluginId: SyntheticPluginId;
  readonly at: string;
  readonly payload: Record<string, unknown>;
  readonly message?: string;
}

export interface SyntheticRunSnapshot {
  readonly id: StoreEventId;
  readonly runId: SyntheticRunId;
  readonly workspaceId: SyntheticWorkspaceId;
  readonly at: string;
  readonly payload: Record<string, unknown>;
  readonly phase: SyntheticPhase;
}

export interface SyntheticStoreQuery {
  tenantId?: SyntheticTenantId;
  workspaceId?: SyntheticWorkspaceId;
  status?: SyntheticRunRecordStatus;
  phase?: SyntheticPhase;
  pluginId?: SyntheticPluginId;
  limit?: number;
  cursor?: string;
}

export const defaultStoreQuery = {
  tenantId: undefined,
  workspaceId: undefined,
  limit: 50,
} as const satisfies Omit<SyntheticStoreQuery, 'status' | 'phase' | 'pluginId' | 'cursor'>;

export const asQueryStatus = (status?: string): SyntheticRunRecordStatus | undefined => {
  if (!status) return undefined;
  if (syntheticStatuses.includes(status as SyntheticRunRecordStatus)) {
    return status as SyntheticRunRecordStatus;
  }
  return undefined;
};

export const asSyntheticRunRecordStatus = (value: string): SyntheticRunRecordStatus | undefined => asQueryStatus(value);

export const asSyntheticRunId = (value: string): SyntheticRunId => value as SyntheticRunId;
export const asSyntheticBlueprintId = (value: string): SyntheticBlueprintId => value as SyntheticBlueprintId;
export const asSyntheticTenantId = (value: string): SyntheticTenantId => value as SyntheticTenantId;
export const asSyntheticWorkspaceId = (value: string): SyntheticWorkspaceId => value as SyntheticWorkspaceId;
export const asSyntheticPluginId = (value: string): SyntheticPluginId => value as SyntheticPluginId;
export const asStoreEventId = (value: string): StoreEventId => value as StoreEventId;
export const asStorePlanId = (value: string): StorePlanId => value as StorePlanId;
export const asSyntheticPhase = (value: string): SyntheticPhase => value as SyntheticPhase;

export const asSyntheticPhases = (value: readonly string[]): readonly SyntheticPhase[] =>
  value.filter((phase): phase is SyntheticPhase => syntheticPhases.includes(phase as SyntheticPhase));

export const createRecordFingerprint = (record: SyntheticRunRecord): string =>
  `${record.runId}:${record.tenantId}:${record.workspaceId}:${record.updatedAt}:${record.status}`;

export const normalizePriority = (value: string): string => (value && value.length > 0 ? value : 'medium');
