import {
  type StudioPolicySpec,
  type SessionDescriptor,
  type StudioRunToken,
  type SessionScope,
  normalizeScenarioId,
  normalizeTenantId,
  normalizeWorkspaceId,
  createSessionRegistryWithRun,
  type StudioContext,
} from '@domain/recovery-lab-signal-studio';
import type {
  NoInfer,
  Brand,
} from '@shared/type-level';
import type {
  PluginCatalog,
  PluginExecutionOutput,
  PluginExecutionInput,
  PluginStage,
  PlanToken,
  RunToken,
  TenantId,
} from '@shared/lab-simulation-kernel';
import { createDisposableScope } from '@shared/recovery-lab-kernel';
import { flow } from '@domain/recovery-lab-signal-studio';

export type SuiteRunToken = Brand<string, 'SuiteRunToken'>;

export interface SuiteRequest<TInput = unknown> {
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly policies?: readonly StudioPolicySpec[];
  readonly seedInput?: TInput;
}

export interface SuiteRunEvent {
  readonly at: number;
  readonly plugin: string;
  readonly stage: PluginStage;
  readonly status: 'queued' | 'executing' | 'done';
  readonly runId: StudioRunToken;
}

export interface SuiteExecutionWindow {
  readonly route: string;
  readonly stages: readonly PluginStage[];
  readonly outputs: readonly PluginExecutionOutput<unknown>[];
}

export interface SuiteSummary {
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly runToken: SuiteRunToken;
  readonly windowCount: number;
  readonly eventCount: number;
  readonly score: number;
  readonly catalogFingerprint: string;
  readonly events: readonly SuiteRunEvent[];
}

export interface SuiteResult<TOutput = unknown> {
  readonly ok: boolean;
  readonly summary: SuiteSummary;
  readonly output: TOutput;
  readonly windows: readonly SuiteExecutionWindow[];
}

interface SuiteSession<TCatalog extends PluginCatalog> {
  readonly scope: SessionScope;
  readonly catalog: TCatalog;
  readonly registry: {
    readonly policySnapshot: readonly StudioPolicySpec[];
    readonly catalogFingerprint: string;
  };
  readonly context: StudioContext;
}

const createContext = (tenant: string, workspace: string, scenario: string): StudioContext => {
  const tenantId = normalizeTenantId(tenant);
  const workspaceId = normalizeWorkspaceId(workspace);
  const scenarioId = normalizeScenarioId(scenario);
  return {
    tenant: tenantId,
    workspace: workspaceId,
    scenario: scenarioId,
    runId: `${Date.now()}:${tenantId}:${workspaceId}:${scenarioId}` as StudioRunToken,
  };
};

const scoreFromTrace = (trace: readonly SuiteRunEvent[]): number => {
  if (trace.length === 0) {
    return 0;
  }
  const done = trace.filter((entry) => entry.status === 'done').length;
  return done / trace.length;
};

const toDescriptor = (tenant: string, workspace: string, scenario: string): SessionDescriptor => ({
  tenant,
  workspace,
  runRef: `run:${tenant}:${workspace}:${scenario}`,
});

const toPlanInput = <TInput>(request: SuiteRequest<TInput>, descriptor: SessionDescriptor): PluginExecutionInput<TInput> => ({
  tenant: `tenant:${descriptor.tenant}` as TenantId,
  planId: `plan:${descriptor.runRef}` as PlanToken,
  runId: `run:${descriptor.runRef}` as RunToken,
  stage: 'detect',
  payload: request.seedInput as TInput,
  context: {
    tenant: descriptor.tenant,
    workspace: descriptor.workspace,
    scenario: request.scenario,
    runId: descriptor.runRef,
    policies: (request.policies ?? []).map((policy) => policy.id),
  },
});

export class OrchestrationSuite {
  readonly #sessions = new Map<SuiteRunToken, SuiteSession<PluginCatalog>>();

  public async run<TInput, TOutput>(
    request: SuiteRequest<TInput>,
    transform: (input: TInput) => NoInfer<TOutput>,
  ): Promise<SuiteResult<TOutput>> {
    await using _scope = createDisposableScope();
    const runToken = `${Date.now()}:${request.tenant}:${request.workspace}` as SuiteRunToken;
    const descriptor: SessionDescriptor = toDescriptor(request.tenant, request.workspace, request.scenario);
    const context = createContext(request.tenant, request.workspace, request.scenario);
    const policies = request.policies ?? [];
    const tenantId = normalizeTenantId(request.tenant);
    const workspaceId = normalizeWorkspaceId(request.workspace);
    const scenarioId = normalizeScenarioId(request.scenario);

    const registry = await createSessionRegistryWithRun(
      tenantId,
      workspaceId,
      scenarioId,
      policies,
    );
    const snapshot = registry.catalogSnapshot();
    const session: SuiteSession<PluginCatalog> = {
      scope: {
        id: descriptor.runRef,
        pluginCount: snapshot.catalog.length,
        openedAt: Date.now(),
      },
      catalog: snapshot.catalog,
      registry: {
        policySnapshot: registry.policySnapshot(),
        catalogFingerprint: snapshot.fingerprints,
      },
      context,
    };
    this.#sessions.set(runToken, session);

    try {
      const orderedPlugins = flow(session.catalog)
        .toSorted((left, right) => left.spec.weight - right.spec.weight)
        .unique((plugin) => `${plugin.name}`)
        .toArray();

      const events: SuiteRunEvent[] = [];
      const windows: SuiteExecutionWindow[] = [];
      const groupedByStage = new Map<PluginStage, PluginStage[]>();

      const executionInput = toPlanInput(request, descriptor);

      for (const plugin of orderedPlugins) {
        const pluginName = `${plugin.name}`;
        events.push({
          at: Date.now(),
          plugin: pluginName,
          stage: plugin.stage,
          status: 'queued',
          runId: runToken as unknown as StudioRunToken,
        });
        const byStage = groupedByStage.get(plugin.stage) ?? [];
        byStage.push(plugin.stage);
        groupedByStage.set(plugin.stage, byStage);

        events.push({
          at: Date.now() + 1,
          plugin: pluginName,
          stage: plugin.stage,
          status: 'executing',
          runId: runToken as unknown as StudioRunToken,
        });

        const pluginOutput = await plugin.run(executionInput) as PluginExecutionOutput<unknown>;
        windows.push({
          route: `${descriptor.runRef}:${plugin.stage}`,
          stages: byStage.toSorted(),
          outputs: [
            {
              ...pluginOutput,
              plugin: `${pluginOutput.plugin}`,
            },
          ],
        });

        events.push({
          at: Date.now() + 2,
          plugin: pluginName,
          stage: plugin.stage,
          status: 'done',
          runId: runToken as unknown as StudioRunToken,
        });
      }

      const summary: SuiteSummary = {
        tenant: `${context.tenant}`,
        workspace: `${context.workspace}`,
        scenario: `${context.scenario}`,
        runToken,
        windowCount: windows.length,
        eventCount: events.length,
        score: scoreFromTrace(events),
        catalogFingerprint: session.registry.catalogFingerprint,
        events: events.toSorted((left, right) => left.at - right.at),
      };

      return {
        ok: true,
        summary,
        output: transform(request.seedInput as TInput),
        windows,
      };
    } finally {
      this.#sessions.delete(runToken);
      await registry[Symbol.asyncDispose]();
    }
  }

  public async runBatch<TInput, TOutput>(
    items: readonly SuiteRequest<TInput>[],
    transform: (input: TInput) => NoInfer<TOutput>,
  ): Promise<readonly SuiteResult<TOutput>[]> {
    const jobs = items.map((item) => this.run(item, transform));
    return Promise.all(jobs);
  }

  public sessionCount(): number {
    return this.#sessions.size;
  }
}

export const runSuiteForDescriptor = async <TInput, TOutput>(
  descriptor: SessionDescriptor,
  request: SuiteRequest<TInput>,
  transform: (input: TInput) => NoInfer<TOutput>,
): Promise<SuiteResult<TOutput>> => {
  const orchestrator = new OrchestrationSuite();
  return orchestrator.run(
    {
      ...request,
      tenant: descriptor.tenant,
      workspace: descriptor.workspace,
      scenario: request.scenario,
    },
    transform,
  );
};

export const runSuiteCatalog = async <TInput, TOutput>(
  request: SuiteRequest<TInput>,
  transform: (input: TInput) => NoInfer<TOutput>,
): Promise<SuiteResult<TOutput>> => {
  const orchestrator = new OrchestrationSuite();
  return orchestrator.run(request, transform);
};

export const summarizeSuite = (result: SuiteSummary): string =>
  `${result.tenant}/${result.workspace}/${result.scenario} windows=${result.windowCount} events=${result.eventCount}`;
