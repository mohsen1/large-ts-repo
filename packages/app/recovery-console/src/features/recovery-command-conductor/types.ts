import type { NoInfer, RecursivePath } from '@shared/type-level';
import type { CommandRunbook, RecoverySignal, TenantId, RecoverySimulationResult, OrchestrationPlan } from '@domain/recovery-stress-lab';

export type ConductorSurfaceMode = 'overview' | 'signal' | 'policy' | 'timeline';

export type ConductorStatus = 'idle' | 'preparing' | 'running' | 'succeeded' | 'failed';

export type ConductorTimelineEventType = 'plugin-start' | 'plugin-progress' | 'plugin-complete' | 'plugin-failed';

export type ConductorPhase = 'discover' | 'assess' | 'simulate' | 'actuate' | 'verify' | 'finalize';

export interface ConductorSignalMatrixCell {
  readonly key: string;
  readonly signalId: string;
  readonly severity: RecoverySignal['severity'];
  readonly className: RecoverySignal['class'];
}

export interface ConductorRunbook {
  readonly id: string;
  readonly name: string;
  readonly commandCount: number;
  readonly ownerTeam: string;
}

export interface ConductorPolicyCard {
  readonly key: string;
  readonly policy: string;
  readonly confidence: number;
  readonly impact: 'low' | 'medium' | 'high' | 'critical';
}

export interface ConductorWorkspaceSummary {
  readonly tenantId: TenantId;
  readonly status: ConductorStatus;
  readonly runbooks: readonly ConductorRunbook[];
  readonly signals: readonly ConductorSignalMatrixCell[];
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
}

export interface ConductorPhaseEntry {
  readonly phase: ConductorPhase;
  readonly status: ConductorTimelineEventType;
  readonly pluginName: string;
  readonly details: string;
}

export type ConductorStateField = RecursivePath<ConductorWorkspaceSummary>;

export interface ConductorPageActions {
  readonly start: () => void;
  readonly reset: () => void;
  readonly stop: () => void;
}

export interface ConductorPageResult {
  readonly state: {
    readonly mode: ConductorSurfaceMode;
    readonly status: ConductorStatus;
    readonly phase: ConductorPhase | null;
    readonly timeline: readonly ConductorPhaseEntry[];
    readonly workspace: ConductorWorkspaceSummary;
  };
  readonly actions: ConductorPageActions;
}

export interface ConductorWorkspaceCatalog {
  readonly workspace: TenantId;
  readonly runbooks: readonly ConductorRunbook[];
  readonly signals: readonly ConductorSignalMatrixCell[];
}

export const resolveMetricKey = (tenantId: TenantId, metric: string): `tenant:${TenantId}/${string}` =>
  `tenant:${tenantId}/${metric}`;

export const normalizeStatus = <TStatus extends ConductorStatus>(status: NoInfer<TStatus>): TStatus => status;
