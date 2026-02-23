export type ContinuityEntityId = string;
export type UtcTimestamp = string;

export type StrictPartial<T> = {
  [K in keyof T]?: T[K] | undefined;
};

export type WithMetadata<T, M extends Record<string, unknown>> = T & {
  readonly metadata: Readonly<M>;
};

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ReadonlyRecord<K extends string, V> = {
  readonly [P in K]: V;
};

export type OrderedPair<T> = readonly [T, T];

export type ScenarioStage = 'baseline' | 'planning' | 'dry-run' | 'execution' | 'verification' | 'closed';
export type RiskBand = 'green' | 'amber' | 'red';

export interface ReadinessWindow {
  readonly from: UtcTimestamp;
  readonly to: UtcTimestamp;
  readonly confidence: number;
}

export interface ContinuitySignal {
  readonly signalId: ContinuityEntityId;
  readonly streamId: string;
  readonly kind: string;
  readonly weight: number;
  readonly value: number;
  readonly source: string;
  readonly observedAt: UtcTimestamp;
}

export interface ContinuityAction {
  readonly actionId: ContinuityEntityId;
  readonly owner: string;
  readonly title: string;
  readonly description: string;
  readonly impactScore: number;
  readonly dependencies: ReadonlyArray<ContinuityEntityId>;
  readonly preconditions: ReadonlyArray<string>;
  readonly enabled: boolean;
}

export interface ContinuityPolicy {
  readonly policyId: ContinuityEntityId;
  readonly name: string;
  readonly appliesTo: ReadonlyArray<string>;
  readonly maxConcurrency: number;
  readonly riskTolerance: RiskBand;
}

export interface ContinuityConstraint {
  readonly constraintId: ContinuityEntityId;
  readonly label: string;
  readonly description: string;
  readonly maxRisk: number;
  readonly minCoverage: number;
  readonly enforceDuringStages: ReadonlyArray<ScenarioStage>;
}

export interface ContinuityTopologyNode {
  readonly nodeId: ContinuityEntityId;
  readonly region: string;
  readonly tier: string;
  readonly status: 'healthy' | 'degraded' | 'critical';
  readonly affinity: ReadonlyArray<string>;
}

export interface ContinuityTopologyEdge {
  readonly from: ContinuityEntityId;
  readonly to: ContinuityEntityId;
  readonly strength: number;
  readonly directed: boolean;
}

export interface ContinuityControlContext {
  readonly tenantId: string;
  readonly topologyNodes: ReadonlyArray<ContinuityTopologyNode>;
  readonly topologyEdges: ReadonlyArray<ContinuityTopologyEdge>;
  readonly policy: ContinuityPolicy;
  readonly constraints: ReadonlyArray<ContinuityConstraint>;
}

export interface ContinuityPlan {
  readonly planId: ContinuityEntityId;
  readonly title: string;
  readonly window: OrderedPair<ReadinessWindow>;
  readonly snapshots: ReadonlyArray<ContinuityReadinessSnapshot>;
  readonly signals: ReadonlyArray<ContinuitySignal>;
  readonly actions: ReadonlyArray<ContinuityAction>;
  readonly policy: ContinuityPolicy;
}

export interface ContinuityReadinessSnapshot {
  readonly snapshotId: ContinuityEntityId;
  readonly tenantId: string;
  readonly stage: ScenarioStage;
  readonly confidence: number;
  readonly windows: ReadonlyArray<ReadinessWindow>;
  readonly signals: ReadonlyRecord<string, number>;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface ContinuityConstraintViolation {
  readonly code: string;
  readonly severity: RiskBand;
  readonly title: string;
  readonly detail: string;
}

export interface SimulationOutcome {
  readonly scenarioId: ContinuityEntityId;
  readonly planId: ContinuityEntityId;
  readonly risk: number;
  readonly coverage: number;
  readonly violations: ReadonlyArray<ContinuityConstraintViolation>;
  readonly recommendedActions: ReadonlyArray<string>;
  readonly executedAt: UtcTimestamp;
}

export interface ContinuityRunPayload<TState = unknown> {
  readonly planId: ContinuityEntityId;
  readonly inputState: TState;
  readonly producedAt: UtcTimestamp;
}

export interface ContinuityRunResult {
  readonly scenarioId: ContinuityEntityId;
  readonly planId: ContinuityEntityId;
  readonly outcomes: ReadonlyArray<SimulationOutcome>;
  readonly diagnostics: ReadonlyArray<string>;
}
