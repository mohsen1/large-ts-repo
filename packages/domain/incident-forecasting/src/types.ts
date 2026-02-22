import type { Brand } from '@shared/core';

export type Id<T extends string> = Brand<string, T>;

export interface SignalObservation {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceSystem: string;
  readonly severity: 1 | 2 | 3 | 4 | 5;
  readonly confidence: number;
  readonly eventType: string;
  readonly metadata: Record<string, unknown>;
  readonly observedAt: string;
}

export interface ForecastMetrics {
  readonly score: number;
  readonly confidence: number;
  readonly contributingSignals: readonly string[];
  readonly predictedDowntimeMinutes: number;
}

export interface ServiceDependencyNode {
  readonly id: Id<'dependencyId'>;
  readonly component: string;
  readonly ownerTeam: string;
  readonly criticality: 'low' | 'medium' | 'high' | 'critical';
  readonly blastRadiusMultiplier: number;
}

export interface IncidentForecastPlan<T extends string = string> {
  readonly planId: Id<'incidentPlanId'>;
  readonly tenantId: string;
  readonly title: T;
  readonly description: string;
  readonly triggers: readonly string[];
  readonly playbookSteps: readonly string[];
  readonly generatedAt: string;
  readonly expiresAt: string;
}

export interface RuntimeState<TContext> {
  readonly context: TContext;
  readonly activePhase: string;
  readonly updatedAt: string;
}

export type NonNegativeInteger = `${number}` extends `${infer _}` ? number : never;

export type ForecastRecord<TContext = unknown> = {
  readonly incident: IncidentForecastPlan;
  readonly metrics: ForecastMetrics;
  readonly state: RuntimeState<TContext>;
  readonly affectedDependencies: readonly ServiceDependencyNode[];
};

export type ForecastEnvelope<TPayload> = {
  readonly payload: TPayload;
  readonly schemaVersion: 'v1';
  readonly ingestedAt: string;
};
