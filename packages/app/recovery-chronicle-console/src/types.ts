import type { ChronicleId, ChroniclePlanId, ChronicleRoute, ChronicleRunId, ChronicleStatus, ChronicleTenantId, ChronicleStatus as StatusType } from '@domain/recovery-chronicle-core';

export interface ChronicleRouteOption {
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly label: string;
}

export interface TimelinePoint {
  readonly label: string;
  readonly score: number;
  readonly status: StatusType;
}

export interface ScenarioWorkspaceState {
  readonly runId: ChronicleRunId | null;
  readonly status: ChronicleStatus | 'idle';
  readonly score: number;
  readonly route: ChronicleRoute | null;
  readonly phases: readonly string[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface PluginCardState {
  readonly id: string;
  readonly name: string;
  readonly ready: boolean;
  readonly status: 'ready' | 'active' | 'failed';
}

export interface WorkspaceViewModel {
  readonly planId: ChroniclePlanId | null;
  readonly tenant: ChronicleTenantId | null;
  readonly route: ChronicleRoute | null;
  readonly title: string;
  readonly phases: readonly string[];
  readonly timeline: readonly string[];
}

export interface HealthMetric {
  readonly axis: string;
  readonly score: number;
  readonly trend: 'up' | 'flat' | 'down';
}

export interface UseChronicleActions {
  readonly refresh: () => Promise<void>;
  readonly run: () => Promise<void>;
  readonly reset: () => void;
}

export interface MetricContext {
  readonly id: ChronicleId;
  readonly score: number;
}

export const emptyMetric = { axis: 'resilience', score: 0, trend: 'flat' } as const;
export const emptyTimeline = [] as const;
export const defaultWorkspaceState: ScenarioWorkspaceState = {
  runId: null,
  status: 'idle',
  score: 0,
  route: null,
  phases: [],
  errors: [],
  warnings: [],
};
