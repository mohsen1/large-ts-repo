import type { Brand } from '@shared/type-level';
import type { SignalWindow, TenantId, WorkspaceId, SignalPayload } from '@domain/recovery-lab-signal-studio';
import type { TimelineEvent } from '@shared/lab-simulation-kernel';

export type TwinId = Brand<string, 'TwinId'>;
export type DigitalTwinStatus = 'ready' | 'running' | 'failed' | 'completed';

export interface DigitalTwinRecord {
  readonly id: TwinId;
  readonly tenant: TenantId;
  readonly workspace: WorkspaceId;
  readonly runId: string;
  readonly status: DigitalTwinStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly metrics: Readonly<Record<string, number>>;
}

export interface TwinSnapshot {
  readonly record: DigitalTwinRecord;
  readonly windows: readonly SignalWindow[];
  readonly payload: SignalPayload;
  readonly timeline: readonly TimelineEvent<unknown>[];
}

export interface TwinQuery {
  readonly tenant?: string;
  readonly workspace?: string;
  readonly runId?: string;
  readonly status?: DigitalTwinStatus[];
}

export interface TwinWriteOptions {
  readonly preserveWindowCount: number;
  readonly maxHistory: number;
}

export interface TwinRevision {
  readonly twinId: TwinId;
  readonly version: Brand<number, 'TwinRevision'>;
  readonly token: Brand<string, 'TwinToken'>;
}

export const mergeMetrics = (left: Record<string, number>, right: Record<string, number>): Record<string, number> => {
  const merged: Record<string, number> = { ...left };
  for (const key of Object.keys(right)) {
    const value = right[key];
    merged[key] = (merged[key] ?? 0) + (Number.isFinite(value) ? value : 0);
  }
  return merged;
};

export const defaultTwinToken = `token:${Date.now()}` as Brand<string, 'TwinToken'>;

export const createWindowSignature = (window: SignalWindow): string => `${window.from}-${window.to}`;
