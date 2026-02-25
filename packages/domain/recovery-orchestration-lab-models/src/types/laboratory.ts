import type { NoInfer } from '@shared/type-level';
import type { WorkspaceToken, ScenarioToken, StageToken, CommandToken, PolicyToken } from './brands.js';

export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type LaneState = 'queued' | 'running' | 'blocked' | 'complete' | 'errored';
export type StageResult = 'ok' | 'warn' | 'skip' | 'fail';

export interface StageRunInput<TPayload> {
  readonly traceId: string;
  readonly payload: NoInfer<TPayload>;
  readonly timestamp: string;
}

export interface StageRunOutput<TPayload> {
  readonly stage: StageToken;
  readonly state: LaneState;
  readonly result: StageResult;
  readonly payload: TPayload;
  readonly score: number;
  readonly tags: readonly string[];
}

export interface CommandIntent {
  readonly id: CommandToken;
  readonly stage: StageToken;
  readonly title: string;
  readonly weight: number;
  readonly policy: PolicyToken;
  readonly priority: Priority;
}

export interface PolicyBinding {
  readonly id: PolicyToken;
  readonly version: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export type StageCatalog = Record<StageToken, Readonly<CommandIntent[]>>;

export type MutableBypass<T> = {
  [K in keyof T]: T[K];
};

export type StageCommandTuple<T extends readonly CommandIntent[]> =
  T extends readonly [infer H, ...infer R]
    ? H extends CommandIntent
      ? readonly [H, ...StageCommandTuple<R extends readonly CommandIntent[] ? R : readonly []>]
      : readonly []
    : readonly [];

export type StagePriority<TCommands extends readonly CommandIntent[]> = {
  [K in keyof TCommands as K extends `${number}` ? `slot:${K}` : never]: TCommands[K] extends CommandIntent
    ? CommandIntent['priority']
    : never;
};

export type ScenarioBlueprint<TCommands extends readonly CommandIntent[]> = {
  readonly scenario: ScenarioToken;
  readonly workspace: WorkspaceToken;
  readonly stages: StageCatalog;
  readonly commands: StageCommandTuple<TCommands>;
  readonly policy: PolicyBinding;
};

export const createScenarioBlueprint = <TCommands extends readonly CommandIntent[]>(
  scenario: ScenarioToken,
  workspace: WorkspaceToken,
  stages: StageCatalog,
  commands: TCommands,
  policy: PolicyBinding,
): ScenarioBlueprint<TCommands> => ({
  scenario,
  workspace,
  stages,
  commands: commands as unknown as StageCommandTuple<TCommands>,
  policy,
});
