import type { ReadinessLabExecutionInput, ReadinessLabEventBus, ReadinessLabExecutionOutput, ReadinessLabRunId, ReadinessLabWorkspaceModel } from '@domain/recovery-readiness';
import type { ReadinessSignal } from '@domain/recovery-readiness';

export type ReadinessLabCommandState = 'idle' | 'running' | 'complete' | 'error';

export interface ReadinessLabPluginStatus {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly state: ReadinessLabCommandState;
  readonly warnings: readonly string[];
}

export interface ReadinessLabPageProps {
  readonly tenant: string;
  readonly namespace: string;
  readonly workspaceId: ReadinessLabRunId;
}

export interface ReadinessLabHeatmapCell {
  readonly coordinate: `${string}/${string}`;
  readonly count: number;
  readonly score: number;
}

export interface ReadinessLabDashboardState {
  readonly workspaceId: ReadinessLabRunId;
  readonly events: ReadonlyArray<ReadinessLabExecutionOutput>;
  readonly pluginStates: readonly ReadinessLabPluginStatus[];
  readonly alerts: readonly string[];
  readonly diagnostics: ReadonlyArray<string>;
}

export interface ReadinessLabWorkspaceContext {
  readonly workspace: ReadinessLabWorkspaceModel;
  readonly signalCount: number;
  readonly averageSeverity: number;
  readonly commandState: ReadinessLabCommandState;
}

export type ReadinessLabEventKind = keyof ReadinessLabEventBus<{ event: { step: string; state: ReadinessLabCommandState; now: string } }>;

export interface ReadinessLabHeatmapPayload {
  readonly workspaceId: ReadinessLabRunId;
  readonly cells: ReadonlyArray<ReadinessLabHeatmapCell>;
  readonly updatedAt: string;
}

export interface ReadinessLabExecutionPanel {
  readonly tenant: string;
  readonly runId: string;
  readonly input: ReadinessLabExecutionInput;
  readonly selectedSignalIds: ReadonlySet<ReadinessSignal['signalId']>;
}

export const eventChannelName = <T extends ReadinessLabRunId>(runId: T): `events/${T}` => `events/${runId}` as `events/${T}`;
