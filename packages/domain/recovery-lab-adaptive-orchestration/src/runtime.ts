import { createPluginDefinitionNamespace, withAsyncPluginScope, PluginSession } from '@shared/stress-lab-runtime';
import type { CampaignRunResult, CampaignSnapshot, CampaignDiagnostic, CampaignPlan, CampaignId, TenantId, PlanId, RunId } from './types';

interface RunFrame<TPayload = unknown> {
  readonly runId: RunId;
  readonly tenantId: TenantId;
  readonly campaignId: CampaignId;
  readonly planId: PlanId;
  readonly startedAt: string;
  readonly value?: TPayload;
}

export class CampaignRunScope<TPayload = unknown> {
  readonly #runId: RunId;
  readonly #tenantId: TenantId;
  readonly #campaignId: CampaignId;
  readonly #planId: PlanId;
  readonly #snapshots: CampaignSnapshot<TPayload>[] = [];
  readonly #diagnostics: CampaignDiagnostic[] = [];
  readonly #disposables = new AsyncDisposableStack();
  #closed = false;

  constructor(private readonly frame: RunFrame<TPayload>) {
    this.#runId = frame.runId;
    this.#tenantId = frame.tenantId;
    this.#campaignId = frame.campaignId;
    this.#planId = frame.planId;
  }

  captureDiagnostics(payload: CampaignDiagnostic): void {
    if (this.#closed) {
      return;
    }
    this.#diagnostics.push(payload);
  }

  captureSnapshot(snapshot: CampaignSnapshot<TPayload>): void {
    if (this.#closed) {
      return;
    }
    this.#snapshots.push(snapshot);
  }

  get runId(): RunId {
    return this.#runId;
  }

  get tenantId(): TenantId {
    return this.#tenantId;
  }

  get campaignId(): CampaignId {
    return this.#campaignId;
  }

  get planId(): PlanId {
    return this.#planId;
  }

  snapshotCount(): number {
    return this.#snapshots.length;
  }

  diagnosticsCount(): number {
    return this.#diagnostics.length;
  }

  summarize(): CampaignRunResult<TPayload> {
    return {
      runId: this.#runId,
      campaignId: this.#campaignId,
      stage: 'execute',
      startedAt: this.frame.startedAt,
      completedAt: new Date().toISOString(),
      ok: this.#closed,
      output: this.frame.value as TPayload,
      diagnostics: this.#diagnostics,
    };
  }

  stageSnapshots(): readonly CampaignSnapshot<TPayload>[] {
    return this.#snapshots;
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return {
      runId: this.#runId,
      tenantId: this.#tenantId,
      campaignId: this.#campaignId,
      planId: this.#planId,
      snapshotCount: this.snapshotCount(),
      diagnosticsCount: this.diagnosticsCount(),
      startedAt: this.frame.startedAt,
      closed: this.#closed,
    };
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return this.#disposables.disposeAsync();
  }

  [Symbol.dispose](): void {
    this.#closed = true;
  }
}

export const withCampaignRunScope = async <
  TPayload,
  TResult,
>(
  frame: RunFrame<TPayload>,
  run: (scope: CampaignRunScope<TPayload>) => Promise<TResult>,
): Promise<TResult> => {
  await using session = new CampaignRunScope(frame);
  const result = await run(session);
  return result;
};

export const buildRunScopeFromPlan = (plan: CampaignPlan): CampaignRunScope => {
  return new CampaignRunScope({
    runId: `run:${plan.planId}:${Date.now()}` as RunId,
    tenantId: plan.tenantId,
    campaignId: plan.campaignId,
    planId: plan.planId,
    startedAt: new Date().toISOString(),
  });
};

export const summarizeWithScope = <TPayload>(scope: CampaignRunScope<TPayload>): string => {
  const summary = scope.toJSON();
  return `${summary.runId} snapshots=${String(summary.snapshotCount)} diagnostics=${String(summary.diagnosticsCount)} closed=${String(summary.closed)}`;
};

export const attachSession = async <TPayload, TOutput>(
  scope: CampaignRunScope<TPayload>,
  run: (session: PluginSession) => Promise<TOutput>,
): Promise<TOutput> => {
  const namespace = createPluginDefinitionNamespace('recovery:lab:adaptive');

  const session = new PluginSession({
    tenantId: scope.tenantId,
    namespace,
    requestId: String(scope.runId),
    startedAt: new Date().toISOString(),
  });

  return withAsyncPluginScope(
    {
      tenantId: scope.tenantId,
      namespace,
      requestId: String(scope.runId),
      startedAt: new Date().toISOString(),
    },
    async () => run(session),
  );
};
