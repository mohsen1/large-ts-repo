export type SimulationBand = 'steady' | 'elevated' | 'critical' | 'extreme';
export type SimulationMode = 'drill' | 'chaos' | 'rehearsal';
export type SimulationLifecycle = 'draft' | 'ready' | 'active' | 'finalized' | 'archived';

export interface SimulationActorAvailability {
  readonly actorId: string;
  readonly timezone: string;
  readonly shiftStart: string;
  readonly shiftEnd: string;
  readonly maxConcurrentSteps: number;
  readonly fatigueIndex: number;
}

export interface SimulationDependency {
  readonly dependencyId: string;
  readonly requiredDependencyIds: readonly string[];
  readonly criticalityWeight: number;
}

export interface SimulationNodeMeta {
  readonly id: string;
  readonly name: string;
  readonly serviceArea: string;
  readonly region: string;
  readonly criticality: 1 | 2 | 3 | 4 | 5;
}

export interface SimulationEdgeWeight {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly lagMs: number;
  readonly confidence: number;
}

export interface SimulationLabBlueprint {
  readonly id: string;
  readonly name: string;
  readonly mode: SimulationMode;
  readonly ownerTeam: string;
  readonly lifecycle: SimulationLifecycle;
  readonly nodes: readonly SimulationNodeMeta[];
  readonly edges: readonly SimulationEdgeWeight[];
  readonly dependencies: readonly SimulationDependency[];
  readonly actorAvailability: readonly SimulationActorAvailability[];
}

export interface SimulationBandSignal {
  readonly stepId: string;
  readonly score: number;
  readonly band: SimulationBand;
  readonly rationale: string;
}

export interface SimulationSimulationWindow {
  readonly start: string;
  readonly end: string;
  readonly bufferMinutes: number;
  readonly timezone: string;
}

export interface SimulationPlanDraft {
  readonly blueprintId: string;
  readonly requestedBy: string;
  readonly window: SimulationSimulationWindow;
  readonly allowParallelism: boolean;
  readonly minActorsPerBatch: number;
  readonly maxParallelSteps: number;
  readonly budgetMinutes: number;
}

export interface SimulationPlanProjection {
  readonly draftId: string;
  readonly projectedStartAt: string;
  readonly projectedEndAt: string;
  readonly projectedStepCount: number;
  readonly projectedCriticalPathMs: number;
  readonly band: SimulationBand;
}

export interface SimulationExecutionLedger {
  readonly planId: string;
  readonly events: readonly string[];
  readonly commandHistory: readonly string[];
  readonly warnings: readonly string[];
  readonly bandSignals: readonly SimulationBandSignal[];
}

export interface SimulationOutcomeEstimate {
  readonly planId: string;
  readonly confidence: number;
  readonly bandSignals: readonly SimulationBandSignal[];
  readonly expectedRecoveryMinutes: number;
  readonly residualRisk: number;
  readonly recommendation: string;
}

export interface RecoverySimulationLabResult {
  readonly estimate: SimulationOutcomeEstimate;
  readonly projection: SimulationPlanProjection;
  readonly ledger: SimulationExecutionLedger;
}
