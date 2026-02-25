import { brandValue } from '@shared/command-graph-kernel';
import type { Brand } from '@shared/command-graph-kernel';

export type WorkspaceId = Brand<string, 'workspace'>;
export type CommandId = Brand<string, 'command'>;
export type SessionId = Brand<string, 'session'>;

export type Severity = 'p0' | 'p1' | 'p2' | 'p3';
export type PathLabel = `${'critical' | 'normal' | 'replay'}::${string}`;

export interface CommandShape {
  readonly id: CommandId;
  readonly title: string;
  readonly severity: Severity;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export interface CommandDependencyEdge {
  readonly from: CommandId;
  readonly to: CommandId;
  readonly label: PathLabel;
}

export interface WorkspaceBlueprint {
  readonly title: `${string}::blueprint`;
  readonly commandOrder: readonly CommandId[];
  readonly graph: readonly CommandDependencyEdge[];
  readonly tags: readonly string[];
}

export interface WorkspaceMetrics {
  readonly commandCount: number;
  readonly criticalCount: number;
  readonly replayRatio: number;
  readonly latencyBudgetMs: number;
}

export const makeWorkspaceId = (tenant: string, namespace: string): WorkspaceId =>
  brandValue('workspace', `${tenant}/${namespace}`) as WorkspaceId;

export const makeCommandId = (namespace: string, index: number): CommandId =>
  brandValue('command', `${namespace}:${String(index).padStart(4, '0')}`) as CommandId;

export const makeSessionId = (tenant: string, workspaceId: WorkspaceId): SessionId =>
  brandValue('session', `${tenant}:${String(workspaceId)}`) as SessionId;

export const isReplayPath = (path: PathLabel): path is PathLabel => path.startsWith('replay::');

export const isCommandShape = (value: unknown): value is CommandShape =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { id: unknown }).id === 'string' &&
  (value as { id: string }).id.startsWith('command:') &&
  typeof (value as { title: unknown }).title === 'string' &&
  ['p0', 'p1', 'p2', 'p3'].includes((value as { severity: unknown }).severity as string);

export type BlueprintBySeverity<
  TCommands extends readonly CommandShape[],
  TSeverity extends Severity = Severity,
> = {
  [K in keyof TCommands]: TCommands[K] extends { readonly severity: TSeverity } ? TCommands[K] : never;
};

export const criticalCommands = <
  const TCommands extends readonly CommandShape[],
>(commands: TCommands): BlueprintBySeverity<TCommands, 'p0'> =>
  commands.filter((command): command is TCommands[number] => command.severity === 'p0') as BlueprintBySeverity<TCommands, 'p0'>;
