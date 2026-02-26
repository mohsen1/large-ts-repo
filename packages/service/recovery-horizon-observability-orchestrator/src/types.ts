import type { PluginStage, HorizonSignal, JsonLike, TimeMs, RunId } from '@domain/recovery-horizon-engine';
import type { Result } from '@shared/result';
import type { ObservatoryTenant, ObservatoryWindowId } from '@domain/recovery-horizon-observability';
import type {
  ObservatorySignalRecord,
  ObservatorySignalManifest,
  ObservatoryFingerprint,
} from '@domain/recovery-horizon-observability';
import type { ObservatoryStage } from '@domain/recovery-horizon-observability';

export type ObservabilityQueryScope = {
  readonly tenantId: string;
  readonly stages?: readonly PluginStage[];
  readonly stageWindow?: number;
  readonly includeArchived?: boolean;
};

export interface ObservabilityPulseInput {
  readonly tenantId: string;
  readonly stageWindow: readonly PluginStage[];
  readonly minStageCount?: number;
  readonly owner: string;
  readonly profile: string;
}

export interface ObservabilityPulseState {
  readonly runId: RunId;
  readonly tenantId: ObservatoryTenant;
  readonly startedAt: TimeMs;
  readonly stages: readonly PluginStage[];
  readonly snapshotId: ObservatoryWindowId;
}

export interface ObservabilitySignalEnvelope {
  readonly manifest: ObservatorySignalManifest<ObservatoryStage>;
  readonly signal: ObservatorySignalRecord<ObservatoryStage, JsonLike>;
  readonly fingerprint: ObservatoryFingerprint;
  readonly trace: readonly ObservatoryStage[];
}

export interface ObservabilityStageSample {
  readonly stage: PluginStage;
  readonly metric: number;
  readonly errors: number;
  readonly tags: readonly string[];
}

export interface ObservabilityPlan {
  readonly runId: RunId;
  readonly tenantId: ObservatoryTenant;
  readonly profile: string;
  readonly stageWindow: readonly PluginStage[];
  readonly signals: readonly HorizonSignal<PluginStage, JsonLike>[];
  readonly createdAt: TimeMs;
}

export interface ObservabilityPulseResult {
  readonly state: ObservabilityPulseState;
  readonly summary: ObservabilitySummary;
  readonly trace: readonly ObservatoryStage[];
}

export interface ObservabilitySummary {
  readonly totalSignals: number;
  readonly totalErrors: number;
  readonly totalWindows: number;
  readonly stages: Record<PluginStage, number>;
}

export interface PluginExecutionPlan<TStage extends PluginStage = PluginStage> {
  readonly stage: TStage;
  readonly runId: RunId;
  readonly pluginKey: string;
  readonly timestamp: TimeMs;
}

export type ObservabilityEvent = {
  readonly kind: 'refresh' | 'snapshot' | 'trend' | 'error';
  readonly at: TimeMs;
  readonly tenantId: string;
  readonly details: string;
};

export type ObservatoryResult<T> = Result<T>;
