import type { Brand } from '@shared/type-level';

export type NonEmptyArray<T> = [T, ...T[]];

export type Percent = Brand<number, 'Percent'>;
export type Millis = Brand<number, 'Millis'>;
export type ScenarioId = Brand<string, 'ScenarioId'>;
export type CommandId = Brand<string, 'CommandId'>;
export type IncidentId = Brand<string, 'IncidentId'>;

export type NumericString<T extends string = string> = `${T}${number}` | `${number}`;

export type ReadOnlyTuple<T> = readonly [T, ...T[]];

export interface BrandedReadonlyRecord<TKey extends string = string, TValue = unknown> {
  readonly [key: string]: never;
}

export type Result<T, E = string> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export type MaybePromise<T> = T | Promise<T>;

export interface WeightedItem<TValue, TId extends string = string> {
  readonly id: TId;
  readonly value: TValue;
  readonly weight: number;
}

export interface ScalarProfile {
  readonly min: number;
  readonly max: number;
  readonly target: number;
  readonly unit: string;
}

export interface TimelinePoint {
  readonly timestamp: string;
  readonly atMs: Millis;
  readonly value: number;
}

export interface SeverityBand {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly hue: `#${string}`;
}

export interface ScenarioSignal {
  readonly signalId: Brand<string, 'ScenarioSignalId'>;
  readonly name: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly score: Percent;
  readonly observedAt: string;
  readonly context: Record<string, string>;
  readonly source: 'telemetry' | 'manual' | 'simulation';
}

export interface ScenarioCommand {
  readonly commandId: CommandId;
  readonly commandName: string;
  readonly targetService: string;
  readonly estimatedDurationMs: Millis;
  readonly resourceSpendUnits: number;
  readonly prerequisites: readonly CommandId[];
  readonly blastRadius: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface ScenarioLink {
  readonly from: CommandId;
  readonly to: CommandId;
  readonly reason: string;
  readonly coupling: number;
}

export interface ScenarioBlueprint {
  readonly scenarioId: ScenarioId;
  readonly incidentId: IncidentId;
  readonly name: string;
  readonly windowMinutes: number;
  readonly baselineConfidence: Percent;
  readonly signals: readonly ScenarioSignal[];
  readonly commands: readonly ScenarioCommand[];
  readonly links: readonly ScenarioLink[];
  readonly policies: readonly string[];
}

export interface ScenarioConstraint {
  readonly constraintId: Brand<string, 'ScenarioConstraintId'>;
  readonly type: 'max_parallelism' | 'max_blast' | 'must_complete_before' | 'region_gate';
  readonly description: string;
  readonly severity: 'warning' | 'error';
  readonly commandIds: readonly CommandId[];
  readonly limit: number;
}

export interface ScenarioPlan {
  readonly planId: Brand<string, 'ScenarioPlanId'>;
  readonly blueprintId: ScenarioId;
  readonly version: number;
  readonly commandIds: readonly CommandId[];
  readonly createdAt: string;
  readonly expectedFinishMs: Millis;
  readonly score: number;
  readonly constraints: readonly ScenarioConstraint[];
  readonly warnings: readonly string[];
}

export interface PlanWindow {
  readonly startAt: string;
  readonly endAt: string;
  readonly commandIds: readonly CommandId[];
  readonly concurrency: number;
}

export interface PlanCandidate {
  readonly candidateId: Brand<string, 'PlanCandidateId'>;
  readonly blueprintId: ScenarioId;
  readonly orderedCommandIds: readonly CommandId[];
  readonly windows: readonly PlanWindow[];
  readonly score: number;
  readonly risk: number;
  readonly resourceUse: number;
}

export interface SimulationFrame {
  readonly frameId: Brand<string, 'SimulationFrameId'>;
  readonly commandId: CommandId;
  readonly planId: Brand<string, 'ScenarioPlanId'>;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly blockedBy: readonly CommandId[];
  readonly state: 'queued' | 'running' | 'completed' | 'failed' | 'aborted';
  readonly exitCode?: number;
  readonly events: readonly string[];
}

export interface SimulationResult {
  readonly simulationId: Brand<string, 'SimulationId'>;
  readonly planId: Brand<string, 'ScenarioPlanId'>;
  readonly scenarioId: ScenarioId;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly frames: readonly SimulationFrame[];
  readonly violations: readonly ScenarioConstraint[];
  readonly riskScore: number;
  readonly confidence: Percent;
  readonly logs: readonly string[];
}

export interface ScenarioMetrics<TTag extends string = string> {
  readonly tags: readonly TTag[];
  readonly score: number;
  readonly completionRate: Percent;
  readonly meanTimeToRecoveryMs: Millis;
  readonly errorRate: number;
  readonly stressIndex: number;
}

export interface ScenarioReadModel<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  readonly scenarioId: ScenarioId;
  readonly generatedAt: string;
  readonly metadata: TMetadata;
  readonly blueprint: ScenarioBlueprint;
  readonly candidates: readonly PlanCandidate[];
  readonly activePlan?: ScenarioPlan;
  readonly lastSimulation?: SimulationResult;
}

export type ConstraintViolation = ScenarioConstraint & {
  readonly commandId: CommandId;
  readonly observed: number;
};

export interface ScenarioPolicyInput {
  readonly incidentSeverity: 'low' | 'medium' | 'high' | 'critical';
  readonly tenant: string;
  readonly services: readonly string[];
  readonly region: string;
  readonly availableOperators: number;
}

export interface PolicyEvaluationResult {
  readonly policyId: string;
  readonly passed: boolean;
  readonly reason: string;
  readonly adjustedLimit?: number;
}

export interface ScenarioProfile {
  readonly profileId: Brand<string, 'ScenarioProfileId'>;
  readonly name: string;
  readonly maxParallelism: number;
  readonly maxBlastRadius: number;
  readonly maxRuntimeMs: Millis;
  readonly allowManualOverride: boolean;
  readonly policyIds: readonly string[];
}

export type ScoreFn<T> = (input: T) => number;

export interface ScoreVector {
  readonly completeness: number;
  readonly safety: number;
  readonly speed: number;
  readonly blastMitigation: number;
  readonly governance: number;
}

export interface ScoreSummary {
  readonly overall: number;
  readonly dimensions: ScoreVector;
  readonly details: Readonly<Record<string, number>>;
}

export interface TimelineWindow {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly commandIds: readonly CommandId[];
}

export const asScenarioId = (value: string): ScenarioId => value as ScenarioId;
export const asIncidentId = (value: string): IncidentId => value as IncidentId;
export const asCommandId = (value: string): CommandId => value as CommandId;
export const asScenarioProfileId = (value: string): ScenarioProfile['profileId'] => value as ScenarioProfile['profileId'];
export const asScenarioSignalId = (value: string): ScenarioSignal['signalId'] => value as ScenarioSignal['signalId'];
export const asScenarioPlanId = (value: string): ScenarioPlan['planId'] => value as ScenarioPlan['planId'];
export const asScenarioConstraintId = (value: string): ScenarioConstraint['constraintId'] => value as ScenarioConstraint['constraintId'];
export const asPlanCandidateId = (value: string): PlanCandidate['candidateId'] => value as PlanCandidate['candidateId'];
export const asSimulationFrameId = (value: string): SimulationFrame['frameId'] => value as SimulationFrame['frameId'];
export const asSimulationId = (value: string): SimulationResult['simulationId'] => value as SimulationResult['simulationId'];
export const asMillis = (value: number): Millis => value as Millis;
export const asPercent = (value: number): Percent => value as Percent;
