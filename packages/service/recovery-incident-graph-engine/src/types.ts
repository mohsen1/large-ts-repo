import type { IncidentGraph, IncidentGraphId, PlannerConfig, PlannerOutput, ReadinessSignal, SimulationResult } from '@domain/recovery-incident-graph';

export interface OrchestrationContext {
  readonly tenantId: string;
  readonly requestedBy: string;
  readonly graph: IncidentGraph;
  readonly signals: readonly ReadinessSignal[];
  readonly planOverrides?: Partial<PlannerConfig>;
}

export interface GraphEngineTrace {
  readonly traceId: string;
  readonly at: string;
  readonly message: string;
  readonly correlation?: string;
}

export interface EngineRequest {
  readonly requestId: string;
  readonly context: OrchestrationContext;
}

export interface EngineResponse {
  readonly requestId: string;
  readonly graphId: IncidentGraphId;
  readonly accepted: boolean;
  readonly plan: PlannerOutput;
  readonly simulation: SimulationResult;
  readonly traces: readonly GraphEngineTrace[];
  readonly summary: {
    readonly startedAt: string;
    readonly completedAt: string;
    readonly readinessImprovement: number;
  };
}

export interface EngineControl {
  readonly requestId: string;
  readonly action: 'pause' | 'resume' | 'cancel' | 'force-complete';
  readonly reason: string;
}

export interface EngineRuntimeState {
  readonly requestId: string;
  readonly startedAt: string;
  readonly status: 'running' | 'idle' | 'paused' | 'cancelled' | 'failed';
  readonly lastEventAt: string;
  readonly processedNodes: number;
}
