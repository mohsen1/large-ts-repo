import { withAsyncPluginScope, createPluginContext, createPluginDefinitionNamespace } from '@shared/stress-lab-runtime';
import {
  type AdaptivePluginDefinition,
  type CatalogPhase,
  catalogByPhase,
  executeAdaptiveChain,
  executePlanChain,
} from './plugin-catalog';
import type {
  CampaignSnapshot,
  CampaignRunResult,
  CampaignPlan,
  CampaignDiagnostic,
  CampaignId,
  CampaignEnvelope,
  TenantId,
  RunId,
  AutomationStage,
  CheckpointId,
} from './types';
import {
  asCampaignId,
  asRunId,
  asPluginExecutionId,
  asDiagnosticsPluginId,
} from './types';
import { buildCheckpointId, InMemoryCampaignAdapterBundle, type CampaignAdapterBundle } from './adapter';
import { buildDiagnosticsFingerprint, normalizeDiagnostics } from './diagnostics';

export interface OrchestrationInput<TPayload = unknown> {
  readonly tenantId: TenantId;
  readonly scenario: string;
  readonly seed: TPayload;
  readonly dryRun?: boolean;
}

export interface OrchestrationContext {
  readonly runId: RunId;
  readonly tenantId: TenantId;
  readonly campaignId: CampaignId;
  readonly startedAt: string;
  readonly phases: readonly CatalogPhase[];
}

export interface OrchestrationOutcome<TPayload = unknown> {
  readonly context: OrchestrationContext;
  readonly plan: CampaignPlan;
  readonly output: CampaignRunResult<TPayload>;
  readonly snapshots: readonly CampaignSnapshot[];
  readonly diagnostics: readonly CampaignDiagnostic[];
  readonly manifestPath: string;
}

export class CampaignExecutionScope<TPayload = unknown> {
  readonly #runId: RunId;
  readonly #tenantId: TenantId;
  readonly #campaignId: CampaignId;
  readonly #createdAt = new Date().toISOString();
  readonly #stack = new AsyncDisposableStack();
  readonly #diagnostics: CampaignDiagnostic[] = [];
  readonly #snapshots: CampaignSnapshot[] = [];
  #closed = false;

  constructor(runId: RunId, tenantId: TenantId, campaignId: CampaignId) {
    this.#runId = runId;
    this.#tenantId = tenantId;
    this.#campaignId = campaignId;
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

  get openedAt(): string {
    return this.#createdAt;
  }

  diagnosticsCount(): number {
    return this.#diagnostics.length;
  }

  snapshotCount(): number {
    return this.#snapshots.length;
  }

  pushDiagnostic(diagnostic: CampaignDiagnostic): void {
    if (this.#closed) {
      return;
    }
    this.#diagnostics.push(diagnostic);
  }

  pushSnapshot(snapshot: CampaignSnapshot): void {
    if (this.#closed) {
      return;
    }
    this.#snapshots.push(snapshot);
  }

  diagnostics(): readonly CampaignDiagnostic[] {
    return this.#diagnostics;
  }

  snapshots(): readonly CampaignSnapshot[] {
    return this.#snapshots;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return this.#stack.disposeAsync();
  }

  [Symbol.dispose](): void {
    this.#closed = true;
  }
}

export const buildPhaseSequence = (phases?: readonly CatalogPhase[]): readonly CatalogPhase[] => {
  if (phases && phases.length > 0) {
    const visited = new Set<CatalogPhase>();
    return phases.filter((phase) => {
      if (visited.has(phase)) {
        return false;
      }
      visited.add(phase);
      return true;
    });
  }
  return ['ingest', 'plan', 'execute', 'verify', 'synthesize'];
};

export const buildPlanSnapshot = <TPayload>(
  runId: RunId,
  tenantId: TenantId,
  campaignId: CampaignId,
  planId: string,
  phases: readonly CatalogPhase[],
  payload: TPayload,
): CampaignSnapshot<TPayload> => ({
  key: buildCheckpointId(tenantId, campaignId, runId) as CheckpointId,
  at: new Date().toISOString(),
  tenantId,
  campaignId,
  planId: planId as any,
  stage: phases.at(-1) ?? 'synthesize',
  payload,
});

export class OrchestratorRuntime {
  #manifestPath = 'adaptive-orchestration/v1';
  readonly #namespace = createPluginDefinitionNamespace('recovery:lab:adaptive');

  async runCampaign<
    TSeed extends Record<string, unknown>,
    TPayload extends Record<string, unknown>,
  >({
    tenantId,
    scenario,
    seed,
    dryRun,
    phases,
    adapter,
  }: OrchestrationInput<TSeed> & {
    readonly phases?: readonly CatalogPhase[];
    readonly adapter?: CampaignAdapterBundle;
  }): Promise<OrchestrationOutcome<TPayload>> {
    const runId = asRunId(`run-${tenantId}-${Date.now()}`);
    const campaignId = asCampaignId(`campaign-${scenario}`);
    const selectedPhases = buildPhaseSequence(phases);
    const context: OrchestrationContext = {
      runId,
      tenantId,
      campaignId,
      startedAt: new Date().toISOString(),
      phases: selectedPhases,
    };

    const storeAdapter: CampaignAdapterBundle = adapter ?? new InMemoryCampaignAdapterBundle();

    await using scope = new CampaignExecutionScope<TPayload>(runId, tenantId, campaignId);

    const phaseChains = selectedPhases.flatMap((phase) => catalogByPhase[phase]);

    const chainResult = await executeAdaptiveChain(
      tenantId,
      {
        scenario,
        tenantId,
        seed,
        mode: dryRun ? 'validate' : 'execute',
      } satisfies Record<string, unknown>,
      phaseChains,
    );

    const resolvedPlan = await executePlanChain(
      tenantId,
      {
        tenantId,
        campaignId,
        planId: `plan-${scenario}` as string & { readonly __brand: 'PlanId' },
        title: `${scenario} bootstrap plan`,
        createdBy: 'orchestrator-runtime',
        mode: 'simulate',
        steps: [],
        riskProfile: 1,
        signalPolicy: ['plan'],
      },
    );

    const phaseCoverage = selectedPhases.map((phase) => phaseChains.filter((entry) => entry.stage === phase).length);

    const diagnostics: CampaignDiagnostic[] = [
      {
        id: asPluginExecutionId(`${runId}:plan`),
        phase: 'plan',
        pluginId: asDiagnosticsPluginId('run-orchestrator'),
        at: new Date().toISOString(),
        source: 'orchestrator-runtime',
        message: `plan prepared for ${scenario}`,
        tags: ['plan', 'orchestrator'],
      },
      ...((resolvedPlan as any).diagnostics ?? []),
    ];

    const normalizedDiagnostics = normalizeDiagnostics(diagnostics);

    const runOutput: CampaignRunResult<TPayload> = {
      runId,
      campaignId,
      stage: selectedPhases.at(-1) ?? 'synthesize',
      startedAt: context.startedAt,
      completedAt: new Date().toISOString(),
      ok: chainResult.ok,
      output: (chainResult.value as TPayload) ?? ({} as TPayload),
      diagnostics: normalizedDiagnostics,
    };

    const snapshot = buildPlanSnapshot(
      runId,
      tenantId,
      campaignId,
      (resolvedPlan as any).planId ?? `plan-${scenario}`,
      selectedPhases,
      {
        chainOk: chainResult.ok,
        chainCoverage: Object.fromEntries(selectedPhases.map((phase, index) => [phase, phaseCoverage[index]])),
        fingerprint: buildDiagnosticsFingerprint(normalizedDiagnostics).value,
      },
    );

    const snapshots = [snapshot];
    const plan: CampaignPlan = {
      tenantId,
      campaignId,
      planId: `plan-${scenario}` as any,
      title: `${scenario} bootstrap plan`,
      createdBy: 'orchestrator-runtime',
      mode: 'simulate',
      steps: [],
      riskProfile: 1,
      signalPolicy: ['plan', 'verify', 'synthesize'],
    };

    const manifestPath = `${context.tenantId}/${this.#manifestPath}/${scope.runId}`;
    await withAsyncPluginScope(
      {
        tenantId,
        namespace: this.#namespace,
        requestId: `${tenantId}:manifest`,
        startedAt: new Date().toISOString(),
      },
      async () => {
        const ctx = createPluginContext(tenantId, this.#namespace, `${runId}:manifest`, {
          planId: plan.planId,
          phases: selectedPhases,
          coverage: plan.steps.length,
        });
        const stageTrace = selectedPhases.join('>');
        const marker = `${ctx.requestId}:${stageTrace}`;

        await storeAdapter.dispatch.publish('orchestrator/outcome', {
          runId,
          campaignId,
          planId: plan.planId,
          tenantId,
          mode: dryRun ? 'validate' : 'execute',
          context: {
            marker,
            trace: ctx,
            manifestPath,
          },
          payload: runOutput,
        } as CampaignEnvelope);
      },
    );

    scope.pushDiagnostic(normalizedDiagnostics[0] as CampaignDiagnostic);
    scope.pushSnapshot(snapshot);

    return {
      context,
      plan,
      output: runOutput,
      snapshots,
      diagnostics: normalizedDiagnostics,
      manifestPath,
    };
  }
}

export interface RuntimeExecutor {
  execute<TInput, TOutput>(input: TInput, chain: readonly AdaptivePluginDefinition[]): Promise<TOutput>;
}

export const executeAsPipeline = async <TInput, TOutput>(
  tenantId: string,
  input: TInput,
  chain: readonly AdaptivePluginDefinition[],
): Promise<TOutput> => {
  const execution = new CampaignExecutionScope<unknown>(`pipeline-${tenantId}` as RunId, tenantId as TenantId, `campaign-${tenantId}` as CampaignId);
  const namespace = createPluginDefinitionNamespace('recovery:lab:adaptive');

  const result = await withAsyncPluginScope(
    {
      tenantId,
      namespace,
      requestId: `pipeline:${tenantId}`,
      startedAt: new Date().toISOString(),
    },
    async () => {
      const output = await executeAdaptiveChain(tenantId, input as Record<string, unknown>, chain as readonly AdaptivePluginDefinition[]);
      return output;
    },
  );

  await execution[Symbol.asyncDispose]();

  return result.value as TOutput;
};
