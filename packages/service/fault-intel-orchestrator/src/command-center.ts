import {
  asCampaignId,
  type CampaignTemplateOptions,
  type CampaignTemplateRequest,
  type CampaignRunResult,
  type PhaseType,
  type TenantId,
  type WorkspaceId,
} from '@domain/fault-intel-orchestration';
import { type WorkflowDiagnostics, type WorkflowExecutionContext, type WorkflowPlan, type WorkflowTag } from './advanced-workflow';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';

type SessionId = `session-${string}`;
type SessionState = 'idle' | 'running' | 'completed' | 'errored';

interface SessionScopeLike {
  [Symbol.asyncDispose](): Promise<void>;
  [Symbol.dispose]?(): void;
}

class FallbackAsyncSessionScope implements SessionScopeLike {
  private disposed = false;

  async [Symbol.asyncDispose](): Promise<void> {
    this.disposed = true;
  }

  [Symbol.dispose](): void {
    this.disposed = true;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

const AsyncScopeCtor = (globalThis as { AsyncDisposableStack?: new () => AsyncDisposableStack }).AsyncDisposableStack;

type SessionCommand<TPhase extends readonly PhaseType[]> = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly commandId: SessionId;
  readonly request: CampaignTemplateRequest<TPhase>;
  readonly options: CampaignTemplateOptions;
};

type ResultTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...ResultTuple<Tail>]
  : readonly [];

export interface CommandCenterHandle<TPhase extends readonly PhaseType[]> {
  readonly command: SessionCommand<TPhase>;
  readonly startedAt: string;
  readonly plan: WorkflowPlan<TPhase>;
  readonly context: WorkflowExecutionContext<TPhase>;
}

export interface CommandCenterSnapshot<TPhase extends readonly PhaseType[]> {
  readonly summary: {
    readonly sessionId: SessionId;
    readonly executedAt: string;
    readonly state: SessionState;
  };
  readonly plan: WorkflowPlan<TPhase>;
  readonly diagnostics?: WorkflowDiagnostics;
}

export interface CommandCenterConfig {
  readonly namespace: string;
  readonly maxRunning: number;
}

export interface CommandCenterExecution<TPhase extends readonly PhaseType[]> {
  readonly id: SessionId;
  readonly command: SessionCommand<TPhase>;
  readonly result: CampaignRunResult;
  readonly stageDiagnostics: readonly Result<CampaignRunResult, string>[];
  readonly diagnostics?: WorkflowDiagnostics;
}

const defaultCommandCenterConfig: CommandCenterConfig = {
  namespace: 'fault-intel-command-center',
  maxRunning: 8,
};

const nextSessionId = (prefix: string): SessionId => `${prefix}:${Date.now()}` as SessionId;

const toErrorCode = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : 'command-center-failure';

const formatWorkflowTag = (value: string): WorkflowTag => `tag:${value}`;

export class CommandCenter<TPhase extends readonly PhaseType[]> {
  private readonly namespace: string;
  private readonly maxRunning: number;
  private readonly active = new Map<SessionId, CommandCenterHandle<TPhase>>();
  private readonly completed = new Map<SessionId, CommandCenterSnapshot<TPhase>>();
  private readonly history: CommandCenterSnapshot<TPhase>[] = [];

  public constructor(config: Partial<CommandCenterConfig> = {}) {
    this.namespace = config.namespace ?? defaultCommandCenterConfig.namespace;
    this.maxRunning = config.maxRunning ?? defaultCommandCenterConfig.maxRunning;
  }

  public createCommand(
    request: CampaignTemplateRequest<TPhase>,
    options: Partial<CampaignTemplateOptions> = {},
  ): SessionCommand<TPhase> {
    return {
      tenantId: request.tenantId,
      workspaceId: request.workspaceId,
      commandId: nextSessionId(this.namespace),
      request,
      options: {
        enforcePolicy: options.enforcePolicy,
        maxSignals: options.maxSignals,
        includeAllSignals: options.includeAllSignals,
      } as CampaignTemplateOptions,
    };
  }

  public async execute(
    command: SessionCommand<TPhase>,
    run: (request: SessionCommand<TPhase>) => Promise<Result<CampaignRunResult, string>>,
  ): Promise<Result<CommandCenterExecution<TPhase>, string>> {
    if (this.active.size >= this.maxRunning) {
      return fail('command-center-full');
    }

    const stackType = AsyncScopeCtor ?? FallbackAsyncSessionScope;
    await using scope = new stackType();
    void scope;

    const plan = this.buildStaticPlan(command.request, command.options);
    const context: WorkflowExecutionContext<TPhase> = {
      planId: command.commandId,
      phases: command.request.phases,
      activeTags: new Set([this.namespace, 'command-center']),
      startedAt: new Date().toISOString(),
      campaignId: asCampaignId(`${command.tenantId}:${command.workspaceId}:${command.request.campaignSeed}` as never),
    };

    const handle: CommandCenterHandle<TPhase> = {
      command,
      startedAt: new Date().toISOString(),
      plan,
      context,
    };
    this.active.set(command.commandId, handle);

    const result = await run(command);
    const elapsed = Math.max(0, Date.now() - Date.parse(handle.context.startedAt));
    const snapshotState: SessionState = result.ok ? 'completed' : 'errored';
    const diagnostics = result.ok
      ? {
          workflowId: plan.workflowId,
          signalCount: result.value.signals.length,
          uniqueSignals: new Set(result.value.signals.map((signal) => signal.signalId)).size,
          riskWindow: result.value.riskScore,
          topTransport: result.value.signals[0]?.transport ?? 'mesh',
          elapsedMs: elapsed,
        }
      : undefined;

    const snapshot: CommandCenterSnapshot<TPhase> = {
      summary: {
        sessionId: command.commandId,
        executedAt: new Date().toISOString(),
        state: snapshotState,
      },
      plan,
      diagnostics,
    };

    this.active.delete(command.commandId);
    this.completed.set(command.commandId, snapshot);
    this.history.push(snapshot);

    if (!result.ok) {
      return fail(toErrorCode(result.error));
    }

    return ok({
      id: command.commandId,
      command,
      result: result.value,
      stageDiagnostics: [result],
      diagnostics,
    });
  }

  public listHistory(): readonly CommandCenterSnapshot<TPhase>[] {
    return this.history.slice(-64);
  }

  public listActive(): readonly CommandCenterHandle<TPhase>[] {
    return [...this.active.values()];
  }

  public close(commandId: SessionId): void {
    this.active.delete(commandId);
    this.completed.delete(commandId);
  }

  public clearHistory(limit = 64): void {
    const entries = this.history.slice(-limit);
    this.history.length = 0;
    this.history.push(...entries);
  }

  private buildStaticPlan(
    request: CampaignTemplateRequest<TPhase>,
    options: CampaignTemplateOptions,
  ): WorkflowPlan<TPhase> {
    return {
      workflowId: `${request.tenantId}:${request.workspaceId}:${request.phases.join('.')}` as WorkflowId,
      tenantId: request.tenantId,
      workspaceId: request.workspaceId,
      route: request.phases,
      phases: request.phases as unknown as WorkflowPlan<TPhase>['phases'],
      signalBuckets: {
        notice: [],
        advisory: [],
        warning: [],
        critical: [],
      },
      tags: new Set([formatWorkflowTag('command-center')]),
      options,
      signature: `${request.tenantId}:${request.workspaceId}:command` as WorkflowPlan<TPhase>['signature'],
    };
  }
}

type WorkflowId = `${string}:${string}:${number}`;

export const createCommandCenter = (): CommandCenter<readonly ['intake', 'triage', 'remediation', 'recovery']> =>
  new CommandCenter<readonly ['intake', 'triage', 'remediation', 'recovery']>();

export const summarizeHistory = <TPhase extends readonly PhaseType[]>(items: readonly CommandCenterSnapshot<TPhase>[]): ResultTuple<[
  readonly [string, string, number],
  readonly [string, string, number],
]> => {
  const grouped = items.reduce((acc, snapshot) => {
    const next = acc.get(snapshot.plan.workflowId) ?? 0;
    acc.set(snapshot.plan.workflowId, next + 1);
    return acc;
  }, new Map<string, number>());

  const summary = [...grouped.entries()].sort((left, right) => right[1] - left[1]);
  const top = summary.at(0);
  const next = summary.at(1);
  const tuple: ResultTuple<[
    readonly [string, string, number],
    readonly [string, string, number],
  ]> = [
    top ? [top[0], 'top', top[1]] : ['none', 'top', 0],
    next ? [next[0], 'second', next[1]] : ['none', 'second', 0],
  ];

  return tuple;
};
