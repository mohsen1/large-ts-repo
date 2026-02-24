import { StreamCommandPluginId, CommandPlan, CommandPlanId, CommandRunResult, CommandRunContext } from '@domain/streaming-command-intelligence';
import type { CommandTenantId, CommandTraceId, CommandStepId } from '@domain/streaming-command-intelligence';
import type { StreamId } from '@domain/streaming-engine';
import type { StreamHealthSignal } from '@domain/streaming-observability';

export interface CommandIntelligenceSnapshot {
  readonly snapshotId: string;
  readonly tenantId: CommandTenantId;
  readonly streamId: StreamId;
  readonly recordedAt: string;
  readonly pluginIds: readonly StreamCommandPluginId[];
  readonly plans: readonly CommandPlan[];
}

export interface CommandIntelligenceEvent {
  readonly eventId: string;
  readonly tenantId: CommandTenantId;
  readonly streamId: StreamId;
  readonly traceId: CommandTraceId;
  readonly pluginId: StreamCommandPluginId;
  readonly pluginName: string;
  readonly stepId: CommandStepId;
  readonly signalCount: number;
  readonly at: string;
  readonly signals: readonly StreamHealthSignal[];
}

export interface CommandIntelligenceRecord {
  readonly runId: CommandPlanId;
  readonly tenantId: CommandTenantId;
  readonly streamId: StreamId;
  readonly context: CommandRunContext;
  readonly result: CommandRunResult;
  readonly plan: CommandPlan;
  readonly events: readonly CommandIntelligenceEvent[];
  readonly updatedAt: string;
}

export interface CommandRunCursor {
  readonly tenantId: CommandTenantId;
  readonly streamId: StreamId;
  readonly cursor: string;
  readonly limit: number;
}
