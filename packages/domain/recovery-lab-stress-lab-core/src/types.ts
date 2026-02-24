import type {
  Brand,
  IncidentChannel,
  IncidentSeverity,
  NoInfer,
  PluginRunId,
  RecoverySignal,
  RuntimeChecksum,
  RunPlanId,
  TenantId,
} from '@shared/orchestration-lab-core';
import { toPluginRunId, toRunPlanId, toTenantId, toRuntimeChecksum } from '@shared/orchestration-lab-core';
export type { RunPlanId, TenantId };

export type LabMode = 'chaos' | 'synthesis' | 'continuity';
export type LabPhase = 'discovery' | 'validation' | 'execution' | 'rollback';
export type StageLabel = `stage:${LabPhase}`;
export type StagePath = `stage:${LabMode}:${LabPhase}`;
export type DirectiveTag = `directive:${string}`;
export type PluginTagName = `tag:${string}`;
export type WorkspaceToken = Brand<string, 'WorkspaceToken'>;
export type WorkspaceFingerprint = Brand<string, 'WorkspaceFingerprint'>;
export type CommandId = PluginRunId;
export type ArtifactId = Brand<string, 'ArtifactId'>;
export type CommandCorrelationId = Brand<string, 'CommandCorrelationId'>;
export type ArtifactChecksum = RuntimeChecksum;
export type SeverityVector<T extends number> = readonly [T, ...readonly T[]];

export interface StageDescriptor<TMode extends LabMode = LabMode, TLabel extends StageLabel = StageLabel> {
  readonly mode: TMode;
  readonly label: TLabel;
  readonly description: string;
}

export interface SignalEnvelope {
  readonly tenant: TenantId;
  readonly incident: IncidentId;
  readonly severity: IncidentSeverity;
  readonly channel: IncidentChannel;
  readonly signalId: Brand<string, 'SignalId'>;
  readonly category: `${IncidentChannel}:${string}`;
}

export interface SignalFingerprint {
  readonly tenant: TenantId;
  readonly channel: IncidentChannel;
  readonly severity: IncidentSeverity;
  readonly raw: Brand<string, 'SignalFingerprint'>;
}

export interface LabDirectiveClause {
  readonly id: DirectiveTag;
  readonly service: string;
  readonly action: string;
  readonly budget: number;
}

export interface LabDirective {
  readonly id: DirectiveTag;
  readonly mode: LabMode;
  readonly priority: 1 | 2 | 3 | 4 | 5;
  readonly title: string;
  readonly tags: readonly PluginTagName[];
  readonly clauses: readonly LabDirectiveClause[];
  readonly weight: Brand<number, 'DirectiveWeight'>;
  readonly summary: string;
}

export interface LabArtifact {
  readonly id: ArtifactId;
  readonly tenant: TenantId;
  readonly mode: LabMode;
  readonly createdAt: string;
  readonly checksum: ArtifactChecksum;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface LabPlanInput {
  readonly runId: RunPlanId;
  readonly commandId: CommandId;
  readonly tenant: TenantId;
  readonly title: string;
  readonly window: { readonly from: string; readonly to: string; readonly timezone: string };
  readonly mode: LabMode;
  readonly signals: readonly RecoverySignal[];
  readonly metadata: Readonly<Record<string, string | number>>;
}

export interface LabPlanOutput {
  readonly runId: RunPlanId;
  readonly tenant: TenantId;
  readonly title: string;
  readonly mode: LabMode;
  readonly directives: readonly LabDirective[];
  readonly artifacts: readonly LabArtifact[];
}

export interface LabRunSnapshot {
  readonly runId: RunPlanId;
  readonly tenant: TenantId;
  readonly mode: LabMode;
  readonly phase: LabPhase;
  readonly directiveCount: number;
  readonly artifactCount: number;
}

export type TuplePrepend<TItem, TTuple extends readonly unknown[]> = readonly [TItem, ...TTuple];
export type TupleAppend<TTuple extends readonly unknown[], TItem> = readonly [...TTuple, TItem];
export type TupleTail<TTuple extends readonly unknown[]> = TTuple extends readonly [unknown, ...infer Rest] ? Rest : readonly [];
export type TupleHead<TTuple extends readonly unknown[]> = TTuple extends readonly [infer Head, ...unknown[]] ? Head : never;

export type StageTuple = readonly [LabPhase, ...LabPhase[]];
export type StageRoute<TPhases extends StageTuple, TBase extends string = ''> = TPhases extends readonly [
  infer Head extends string,
  ...infer Tail extends string[],
]
  ? `${TBase}${TBase extends '' ? '' : ':'}${Head}` | StageRoute<Extract<Tail, StageTuple>, `${TBase}${TBase extends '' ? '' : ':'}${Head}`>
  : TBase;
export type DefaultStageRoute = StageRoute<['discovery', 'validation', 'execution', 'rollback']>;

export type StageMap<TModes extends readonly LabMode[]> = { [TMode in TModes[number]]: readonly StageLabel[] };

export type DirectiveByMode<TDirectives extends readonly LabDirective[]> = {
  [TMode in LabMode]: readonly Extract<TDirectives[number], { readonly mode: TMode }>[];
};

export type MappedDirectives<TDirectives extends readonly LabDirective[]> = {
  [TMode in LabMode]: DirectiveByMode<TDirectives>[TMode][number];
};

export type ExpandByMode<TValue, TModes extends readonly LabMode[]> = {
  [TMode in TModes[number]]: TValue & { readonly mode: TMode };
};

export type NoInferSignal<T extends RecoverySignal> = NoInfer<T>;
export type NoInferId<T extends string> = NoInfer<T>;

export const modeSeed = (mode: LabMode): `${LabMode}-seed` => `${mode}-seed`;
export const phaseSeed = (phase: LabPhase): StageLabel => `stage:${phase}`;
export const commandSeed = (tenant: string, sequence: number): CommandId => `${tenant}:command:${String(sequence).padStart(8, '0')}` as CommandId;
export const workspaceSeed = (tenant: string): WorkspaceToken => `${tenant}:workspace` as WorkspaceToken;
export const commandCorrelationId = (value: string): CommandCorrelationId => value as CommandCorrelationId;
export const toCommandCorrelationId = (value: string): CommandCorrelationId => commandCorrelationId(value);
export const toIncidentId = (value: string): IncidentId => value as IncidentId;

export type IncidentId = Brand<string, 'IncidentId'>;

export const toArtifactId = (value: string): ArtifactId => `${value}` as ArtifactId;
export const toArtifactChecksum = (value: string): ArtifactChecksum => toRuntimeChecksum(value);
export const toRunId = (value: string): RunPlanId => toRunPlanId(value);
export const toCommandRunId = (value: string): CommandId => toPluginRunId(value);
export const toModeTenant = (value: string): TenantId => toTenantId(value);

export const makeWindow = (
  now = new Date(),
  minutes = 60,
): { readonly from: string; readonly to: string; readonly timezone: string } => ({
  from: now.toISOString(),
  to: new Date(now.getTime() + minutes * 60 * 1000).toISOString(),
  timezone: 'UTC',
});

export const directiveTag = (value: string): DirectiveTag => `directive:${value}` as DirectiveTag;
export const artifactId = (tenant: string): ArtifactId => `artifact:${tenant}:${Date.now()}` as ArtifactId;
export const workspaceFingerprint = (tenant: string, mode: LabMode): WorkspaceFingerprint => `${tenant}:${mode}:fp` as WorkspaceFingerprint;
