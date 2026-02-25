import {
  createIteratorChain,
  createSharedRegistry,
  type PluginContext,
  type PluginInvocation,
} from '@shared/fault-intel-runtime';
import { fail, ok, type Result } from '@shared/result';
import { querySignals, createFaultIntelStore } from '@data/fault-intel-store';
import {
  asCampaignId,
  asTenantId,
  asWorkspaceId,
  createCampaignPlan,
  CampaignTemplateRequest,
  CampaignRunResult,
  IncidentSignal,
  type CampaignId,
  type TenantId,
  type WorkspaceId,
} from '@domain/fault-intel-orchestration';
import { bootstrappedTemplates } from './bootstrap';
import { computeSignalDensity } from './telemetry';

interface RuntimePlugin {
  readonly id: string;
  run: (input: unknown) => Promise<unknown> | unknown;
}

type AnyPlugin = RuntimePlugin;

export interface FaultIntelCommand {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly campaignId: CampaignId;
  readonly phases: readonly ['intake', 'triage', 'remediation', 'recovery'];
  readonly request: CampaignTemplateRequest<readonly ['intake', 'triage', 'remediation', 'recovery']>;
}

export interface FaultIntelCommandOptions {
  readonly preferredTemplate?: string;
  readonly signalLimit?: number;
  readonly includeSynthetic?: boolean;
}

export interface FaultIntelExecution {
  readonly planId: string;
  readonly run: CampaignRunResult;
  readonly diagnostics: readonly PluginInvocation<PluginContext, unknown, unknown>[];
  readonly traceId: string;
}

export class CampaignExecutor {
  private readonly registry = createSharedRegistry<PluginContext>();
  private readonly store = createFaultIntelStore();
  private readonly builtInPlugins: readonly RuntimePlugin[] = [
    {
      id: 'seed',
      run: ((request: CampaignTemplateRequest<readonly ['intake', 'triage', 'remediation', 'recovery']>) => {
        const plan = createCampaignPlan(request, [] as readonly IncidentSignal[], {
          enforcePolicy: true,
          maxSignals: 128,
          includeAllSignals: true,
        });
        return plan.orderedSignals as unknown as readonly IncidentSignal[];
      }) as RuntimePlugin['run'],
    },
    {
      id: 'score',
      run: ((signals: readonly IncidentSignal[]) => signals.map((signal) => ({ ...signal, score: signal.metrics.length }))) as RuntimePlugin['run'],
    },
    {
      id: 'filter',
      run: ((signals: readonly IncidentSignal[]) => signals.filter((signal) => signal.severity !== 'notice')) as RuntimePlugin['run'],
    },
  ];

  public async execute(
    command: FaultIntelCommand,
    options: FaultIntelCommandOptions = {},
  ): Promise<Result<FaultIntelExecution, Error>> {
    const template = this.resolveTemplate(options.preferredTemplate);
    const request = this.normalizeRequest(command);
    const plan = createCampaignPlan(request, [] as const, template.options);
    const seedSignals = await querySignals({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      filters: [],
      limit: options.signalLimit ?? 50,
    });

    const signals = createIteratorChain(seedSignals)
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
      .take(options.signalLimit ?? 128)
      .toArray();

    const templateState = await this.store.upsertTemplate(
      asTenantId(request.tenantId),
      asWorkspaceId(request.workspaceId),
      {
        campaignId: asCampaignId(command.campaignId),
        tenantId: request.tenantId,
        strategy: template.name,
        policyIds: [],
        createdBy: 'orchestrator' as never,
        constraints: { route: plan.activeRoute },
      },
    );
    if (!templateState.ok) {
      return fail(templateState.error);
    }

    const diagnosticBuffer: PluginInvocation<PluginContext, unknown, unknown>[] = [];
    const pluginContext: PluginContext = {
      tenantId: command.tenantId,
      namespace: 'fault-intel-orchestrator',
      tags: new Set(['seed', 'pipeline']),
      timestamp: new Date().toISOString(),
    };

    const pluginCtor = (globalThis as { AsyncDisposableStack?: new () => AsyncDisposableStack }).AsyncDisposableStack;
    if (!pluginCtor) {
      return fail(new Error('AsyncDisposableStack unavailable'));
    }
    await using pluginScope = new pluginCtor();

    const output = await this.runSequential<readonly IncidentSignal[]>(
      request,
      request.phases,
      this.builtInPlugins,
      diagnosticBuffer,
      pluginContext,
    );
    pluginScope.use(this.registry.scope('orchestrator', template.name) as any);

    const finalSignals = createIteratorChain(output)
      .take(options.signalLimit ?? signals.length)
      .toArray();

    const runResult: CampaignRunResult = {
      campaign: plan.blueprint,
      planId: `plan-${Date.now()}` as CampaignRunResult['planId'],
      signals: finalSignals,
      policy: {
        policyId: 'policy::default' as never,
        name: 'default-policy',
        description: 'runtime default',
        requiredStages: ['intake', 'triage', 'remediation'],
        requiredTransports: ['mesh', 'fabric'],
        maxConcurrency: 2,
        timeoutMs: 500,
      },
      executedAt: new Date().toISOString(),
      riskScore: computeSignalDensity(finalSignals),
    };

    const runRecord = await this.store.recordRun(command.tenantId, command.workspaceId, runResult);
    if (!runRecord.ok) {
      return fail(runRecord.error);
    }
    void runRecord.value;
    return ok({
      planId: runResult.planId,
      run: runResult,
      diagnostics: diagnosticBuffer,
      traceId: `trace-${runResult.planId}`,
    });
  }

  public collectTemplateTransports(route: string): string[] {
    return route.split('.');
  }

  public async queryBySeverity(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    severity: IncidentSignal['severity'],
  ): Promise<readonly IncidentSignal[]> {
    const query = await querySignals({
      tenantId,
      workspaceId,
      filters: [{ field: 'severity', operator: 'eq', value: severity }],
      limit: 999,
    });
    return query;
  }

  private resolveTemplate(preferredTemplate?: string) {
    return bootstrappedTemplates.find((entry) => entry.name === preferredTemplate) ?? bootstrappedTemplates[0];
  }

  private normalizeRequest(command: FaultIntelCommand): CampaignTemplateRequest<readonly ['intake', 'triage', 'remediation', 'recovery']> {
    const phases = [...new Set(command.phases)] as unknown as readonly ['intake', 'triage', 'remediation', 'recovery'];
    return {
      tenantId: asTenantId(command.tenantId),
      workspaceId: asWorkspaceId(command.workspaceId),
      campaignSeed: `${command.campaignId}-${phases.join(':')}`,
      owner: command.campaignId,
      phases,
    };
  }

  private async runSequential<TOutput>(
    seed: unknown,
    _route: readonly string[],
    plugins: readonly AnyPlugin[],
    diagnostics: PluginInvocation<PluginContext, unknown, unknown>[],
    context: PluginContext,
  ): Promise<TOutput> {
    let current: unknown = seed;
    for (const plugin of plugins) {
      const started = performance.now();
      const next = await plugin.run(current);
      const ended = performance.now();
      diagnostics.push({
        pluginId: plugin.id,
        context,
        input: current,
        output: next,
        elapsedMs: Math.round(ended - started),
      });
      current = next;
    }
    return current as TOutput;
  }
}
