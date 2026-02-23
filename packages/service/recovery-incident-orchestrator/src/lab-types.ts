import type { LabExecution, LabPlanId, OrchestrationLab, OrchestrationLabEnvelope, OrchestrationPolicy, LabPlan } from '@domain/recovery-ops-orchestration-lab';
import type { LabRunRecord, LabQueryFilter } from '@data/recovery-ops-orchestration-lab-store';

export interface OrchestrationLabRunner {
  runPlan(plan: LabPlan): Promise<LabExecution>;
}

export interface OrchestrationLabServiceConfig {
  readonly policy: OrchestrationPolicy;
}

export interface OrchestrationLabServiceDeps extends OrchestrationLabServiceConfig {
  readonly runner: OrchestrationLabRunner;
}

export interface OrchestrationLabSelectionResult {
  readonly envelopeId: OrchestrationLabEnvelope['id'];
  readonly selectedPlanId?: LabPlanId;
  readonly planCount: number;
  readonly scoreCount: number;
}

export interface OrchestrationLabRunResult {
  readonly runId: LabExecution['id'];
  readonly success: boolean;
  readonly durationMs: number;
  readonly stepCount: number;
}

export interface OrchestrationLabWorkspaceView {
  readonly lab: OrchestrationLab;
  readonly envelope: OrchestrationLabEnvelope;
  readonly candidateCount: number;
}

export interface OrchestrationLabWorkspaceQuery {
  readonly filter: LabQueryFilter;
  readonly refresh: () => Promise<void>;
  readonly workspaces: readonly OrchestrationLabWorkspaceView[];
  readonly runs: readonly LabRunRecord[];
}

export interface OrchestrationLabDashboard {
  readonly id: OrchestrationLab['id'];
  readonly signalSeries: readonly { readonly id: string; readonly score: number; readonly tier: string }[];
  readonly latestEvents: readonly {
    readonly id: string;
    readonly labId: OrchestrationLab['id'];
    readonly kind: string;
    readonly timestamp: string;
    readonly actor: string;
    readonly detail: string;
    readonly metadata: Record<string, string | number | boolean>;
  }[];
  readonly scores: readonly { readonly planId: LabPlan['id']; readonly score: number }[];
  readonly summary: {
    readonly totalSignals: number;
    readonly criticalSignals: number;
  };
}

export interface OrchestrationLabWorkspace {
  readonly envelope: OrchestrationLabEnvelope;
  readonly policies: {
    readonly selectedPlanAllowed: boolean;
    readonly scoreCount: number;
    readonly bestPlan?: LabPlan;
  };
  readonly topSignalCount: number;
}

export interface OrchestrationLabPlanResult {
  readonly envelopeId: OrchestrationLabEnvelope['id'];
  readonly planCount: number;
  readonly candidateCount: number;
  readonly selectedPlanId?: LabPlanId;
  readonly summary: {
    readonly selectedPlanAllowed: boolean;
    readonly scoreCount: number;
    readonly bestPlan?: LabPlan;
  };
}
