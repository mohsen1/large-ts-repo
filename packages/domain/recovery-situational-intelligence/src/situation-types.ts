export type ISODateTime = string;

export type Criticality = 1 | 2 | 3 | 4 | 5;

export type RegionCode = 'us-east-1' | 'us-west-2' | 'eu-west-1' | 'ap-southeast-1' | 'sa-east-1';

export type IncidentPhase = 'detect' | 'assess' | 'mitigate' | 'recover' | 'stabilize';

export type CommandStatus = 'queued' | 'running' | 'succeeded' | 'degraded' | 'failed' | 'cancelled';

export interface TimestampedEvent {
  readonly eventId: string;
  readonly at: ISODateTime;
  readonly source: string;
}

export interface SituationalSignal {
  readonly signalId: string;
  readonly domain: string;
  readonly severity: Criticality;
  readonly summary: string;
  readonly source: string;
  readonly tags: readonly string[];
  readonly createdAt: ISODateTime;
  readonly confidence: number;
  readonly evidenceCount: number;
}

export interface ServiceDependency {
  readonly dependencyId: string;
  readonly dependencyName: string;
  readonly criticality: Criticality;
  readonly region: RegionCode;
  readonly ownerTeam: string;
  readonly blastRadius: 'host' | 'region' | 'zone' | 'global';
}

export interface RecoveryWorkloadNode {
  readonly nodeId: string;
  readonly name: string;
  readonly service: string;
  readonly region: RegionCode;
  readonly dependencies: readonly string[];
  readonly dependencyGraph: readonly ServiceDependency[];
  readonly criticality: Criticality;
  readonly recoverySlaMinutes: number;
}

export interface ExecutionWindow {
  readonly start: ISODateTime;
  readonly end: ISODateTime;
  readonly timezone: string;
}

export interface SituationalSnapshot {
  readonly snapshotId: string;
  readonly workloadNodeId: string;
  readonly window: ExecutionWindow;
  readonly cpuUtilization: number;
  readonly memoryUtilization: number;
  readonly latencyP95Ms: number;
  readonly availabilityPercent: number;
  readonly errorBudget: number;
  readonly activeTrafficRatio: number;
  readonly measuredAt: ISODateTime;
}

export interface RecoveryHypothesis {
  readonly hypothesisId: string;
  readonly label: string;
  readonly evidenceWeight: number;
  readonly commands: readonly string[];
  readonly likelyImpactPercent: number;
  readonly sideEffects: readonly string[];
}

export interface RecoveryPlanCandidate {
  readonly planId: string;
  readonly workloadNodeId: string;
  readonly title: string;
  readonly description: string;
  readonly sourceSignalIds: readonly string[];
  readonly hypotheses: readonly RecoveryHypothesis[];
  readonly estimatedRestorationMinutes: number;
  readonly confidence: number;
  readonly createdAt: ISODateTime;
}

export interface CommandResult {
  readonly commandId: string;
  readonly status: CommandStatus;
  readonly startedAt: ISODateTime;
  readonly finishedAt?: ISODateTime;
  readonly details: string;
  readonly dryRun: boolean;
}

export interface SituationalAssessment {
  readonly assessmentId: string;
  readonly phase: IncidentPhase;
  readonly status: CommandStatus;
  readonly workload: RecoveryWorkloadNode;
  readonly snapshot: SituationalSnapshot;
  readonly signalCount: number;
  readonly weightedConfidence: number;
  readonly plan: RecoveryPlanCandidate;
  readonly commands: readonly CommandResult[];
}

export interface PlanningContext {
  readonly operator: string;
  readonly createdAt: ISODateTime;
  readonly environment: 'prod' | 'staging' | 'drill';
  readonly policyTag: string;
  readonly correlationToken: string;
  readonly tags: readonly string[];
}

export interface WeightedMetric<T extends { readonly severity: Criticality }> {
  readonly metric: T;
  readonly weight: number;
}

export type ReadonlyRecord<T> = Readonly<T>;

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type ResultWindow<T> = {
  readonly current: T;
  readonly previous: T;
  readonly delta: number;
};

export interface ScoreModel {
  readonly reliability: number;
  readonly recoverability: number;
  readonly urgency: number;
  readonly operationalRisk: number;
}

export type PlanSelector = (plans: readonly RecoveryPlanCandidate[]) => RecoveryPlanCandidate;
