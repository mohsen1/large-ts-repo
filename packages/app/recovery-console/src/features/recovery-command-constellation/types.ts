import type {
  ConstellationExecutionResult,
  ConstellationOrchestrationPlan,
  ConstellationSignalEnvelope,
  ConstellationOrchestratorOutput,
} from '@domain/incident-command-models';

export type TenantSlug = `tenant:${string}`;
export type ConstellationViewMode = 'compact' | 'detailed' | 'timeline';
export type ConstellationPageMode = 'planner' | 'simulator' | 'observer';

export type ConstellationRoute = `/console/${'command-constellation' | 'constellation-overview' | 'constellation-lab'}`;

export interface ConstellationOverviewFilters {
  readonly tenant: TenantSlug;
  readonly pageMode: ConstellationPageMode;
  readonly includeSimulationArtifacts: boolean;
}

export interface ConstellationPanelState {
  readonly planId: string;
  readonly mode: ConstellationViewMode;
  readonly runCount: number;
}

export interface ConstellationPlanCardProps {
  readonly tenant: TenantSlug;
  readonly plan: ConstellationOrchestrationPlan;
  readonly selected: boolean;
  readonly onSelect: (planId: string) => void;
}

export interface ConstellationTimelinePoint {
  readonly phase: string;
  readonly timestamp: string;
  readonly risk: number;
  readonly tags: readonly string[];
}

export interface ConstellationSummary {
  readonly title: string;
  readonly totalArtifacts: number;
  readonly highRisk: boolean;
  readonly timeline: readonly ConstellationTimelinePoint[];
}

export interface ConstellationPolicyInsight {
  readonly key: string;
  readonly score: number;
  readonly status: 'ok' | 'warning' | 'critical';
}

export interface ConstellationPolicyPayload {
  readonly plan: ConstellationOrchestrationPlan;
  readonly result: ConstellationExecutionResult;
  readonly summary: ConstellationSummary;
}

export interface ConstellationServiceOutput extends ConstellationOrchestratorOutput {}

export interface ConstellationHookState {
  readonly loading: boolean;
  readonly errorMessage?: string;
  readonly summary?: ConstellationSummary;
  readonly plan?: ConstellationOrchestrationPlan;
  readonly signals: readonly ConstellationSignalEnvelope[];
  readonly trace: readonly string[];
  readonly reload: () => void;
}

export type MapTuple<T extends readonly string[]> = {
  [K in keyof T]: [T[K], number];
};

export type PrefixKeys<T> = {
  [K in keyof T & string as `constellation_${K}`]: T[K];
};

export type EnsureReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

export const ensureConstellationPlan = (plan: ConstellationOrchestrationPlan): ConstellationOrchestrationPlan => plan;
