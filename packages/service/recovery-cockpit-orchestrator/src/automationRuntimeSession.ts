import { Brand } from '@shared/type-level';
import { type Result, fail, ok } from '@shared/result';
import { parseBlueprintFromJson, type AutomationBlueprint } from '@domain/recovery-cockpit-orchestration-core';
import { createAutomationRuntime, summarizeRuntime, type RuntimeContext, type RuntimeResult } from './automationRuntime';
import { createAutomationSnapshotStore, buildPoint } from '@data/recovery-cockpit-store';
import {
  type RecoveryAction,
  type RecoveryPlan,
  type RuntimeRun,
  type AuditContext,
  type UtcIsoTimestamp,
  type EntityId,
  type Versioned,
} from '@domain/recovery-cockpit-models';
import { toTimestamp } from '@domain/recovery-cockpit-models';

export type SessionId = Brand<string, 'SessionId'>;

export type AutomationSessionState = 'active' | 'idle' | 'error';

export type SessionRecord = {
  readonly sessionId: SessionId;
  readonly state: AutomationSessionState;
  readonly startedAt: string;
  readonly tenant: Brand<string, 'Tenant'>;
};

export type SessionResult = {
  readonly sessionId: SessionId;
  readonly state: RuntimeResult['state'];
  readonly totalSteps: number;
  readonly warnings: number;
};

class SessionBag {
  readonly #sessions = new Map<SessionId, SessionRecord>();

  open(sessionId: SessionId, tenant: Brand<string, 'Tenant'>): void {
    this.#sessions.set(sessionId, {
      sessionId,
      state: 'active',
      tenant,
      startedAt: new Date().toISOString(),
    });
  }

  close(sessionId: SessionId): void {
    const current = this.#sessions.get(sessionId);
    if (!current) return;
    this.#sessions.set(sessionId, { ...current, state: 'idle' });
  }

  markError(sessionId: SessionId): void {
    const current = this.#sessions.get(sessionId);
    if (!current) return;
    this.#sessions.set(sessionId, { ...current, state: 'error' });
  }

  list(): ReadonlyArray<SessionRecord> {
    return [...this.#sessions.values()];
  }
}

class SessionHandle implements AsyncDisposable {
  #closed = false;
  constructor(
    readonly sessionId: SessionId,
    readonly tenant: Brand<string, 'Tenant'>,
    private readonly bag: SessionBag,
  ) {
    this.bag.open(sessionId, tenant);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.bag.close(this.sessionId);
  }
}

const registry = new SessionBag();
const snapshotStore = createAutomationSnapshotStore();

export const runSession = async (
  sessionId: SessionId,
  payload: string,
  tenant: Brand<string, 'Tenant'>,
  context: Omit<RuntimeContext, 'runId'>,
): Promise<Result<SessionResult, Error>> => {
  await using handle = new SessionHandle(sessionId, tenant, registry);
  try {
    const parsed = parseBlueprintFromJson(payload);
    if (!parsed) {
      registry.markError(sessionId);
      return fail(new Error('invalid blueprint payload'));
    }

    const runtime = createAutomationRuntime(parsed, {
      tenant,
      user: context.user,
      runId: `${tenant}:${sessionId}` as Brand<string, 'RunId'>,
    });
    const result = await runtime.run();
    if (!result.ok) {
      registry.markError(sessionId);
      return fail(result.error, result.code);
    }

    const summary = summarizeRuntime(result.value);
    const fakePlan: RecoveryPlan = {
      planId: 'plan:runtime' as RecoveryPlan['planId'],
      version: 1 as Versioned['version'],
      effectiveAt: toTimestamp(new Date()) as UtcIsoTimestamp,
      labels: { short: 'run', long: 'run', emoji: '⚙️', labels: ['runtime'] },
      mode: 'automated',
      title: 'Runtime recovery plan',
      description: 'Synthetic automation plan used for runtime session diagnostics',
      audit: [],
      slaMinutes: 30,
      isSafe: true,
      actions: [] as readonly RecoveryAction[],
    };

    const auditContext: AuditContext = {
      actor: {
        id: `${tenant}:operator` as EntityId,
        kind: 'operator',
      },
      source: 'runtime',
      requestId: `${tenant}:runtime` as RuntimeRun['runId'],
      correlationId: `${tenant}:session:${sessionId}`,
    };

    const fakeRun: RuntimeRun = {
      runId: `${tenant}:${sessionId}` as RuntimeRun['runId'],
      planId: fakePlan.planId,
      state: 'completed',
      startedAt: toTimestamp(new Date()),
      activeActionIds: [],
      completedActions: [] as RecoveryAction[],
      failedActions: [] as RecoveryAction[],
      context: {
        ...auditContext,
        requestId: `${tenant}:${sessionId}` as RuntimeRun['runId'],
      },
      nextRetryAt: undefined,
    };

    await snapshotStore.save({
      tenant,
      blueprint: parsed,
      plan: fakePlan,
      run: fakeRun,
      points: result.value.steps.map((step) =>
        buildPoint(parsed, step.stepId as AutomationBlueprint['steps'][number]['stepId'], {
          stepState: step.result.state,
          elapsedMs: step.elapsedMs,
        }),
      ),
    });

    return ok({
      sessionId,
      state: result.value.state,
      totalSteps: summary.totalSteps,
      warnings: summary.warnings,
    });
  } catch (error) {
    registry.markError(sessionId);
    return fail(error as Error);
  }
};

export const getSessions = (): ReadonlyArray<SessionRecord> => registry.list();
