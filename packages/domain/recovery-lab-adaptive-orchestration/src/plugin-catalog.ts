import {
  type PluginContext,
  type PluginDefinition,
  type PluginResult,
  type PluginDependency,
  type PluginKind,
  buildPluginDefinition,
  createPluginDefinitionNamespace,
  createPluginKind,
  createPluginVersion,
} from '@shared/stress-lab-runtime';
import {
  type TenantId,
  type CampaignPlan,
  type CampaignEnvelope,
  type CampaignRunResult,
  type CampaignDiagnostic,
  type PlanId,
  type CampaignId,
  type BrandInput,
  asCampaignDependency,
  asCampaignStepId,
  asDiagnosticsPluginId,
  asPluginExecutionId,
  asCampaignId,
  asPlanId,
  type CampaignStepId,
} from './types';

export const automationCatalogNamespace = createPluginDefinitionNamespace('recovery:lab:adaptive');
export const automationVersion = createPluginVersion(1, 4, 0);

export const planningPluginKind = createPluginKind('planning');
export const executionPluginKind = createPluginKind('execution');
export const verifyPluginKind = createPluginKind('verify');
export const synthesizePluginKind = createPluginKind('synthesize');

export type PluginStage = 'ingest' | 'plan' | 'execute' | 'verify' | 'synthesize';
export type PluginRole = 'planner' | 'allocator' | 'executor' | 'auditor' | 'summarizer';

export type AdaptivePluginDefinition<
  TInput = unknown,
  TOutput = unknown,
  TConfig = Record<string, unknown>,
  TKind extends PluginKind = PluginKind,
> = PluginDefinition<TInput, TOutput, TConfig, TKind> & {
  readonly stage: PluginStage;
  readonly role: PluginRole;
  readonly profile: {
    readonly latencyMs: number;
    readonly mandatory: boolean;
  };
  readonly namespace: ReturnType<typeof createPluginDefinitionNamespace>;
};

export type AnyAdaptivePluginDefinition = AdaptivePluginDefinition<
  unknown,
  unknown,
  Record<string, unknown>,
  PluginKind
>;

type BuildPluginRun<TInput, TOutput> = (
  context: PluginContext<Record<string, unknown>>,
  input: TInput,
) => Promise<PluginResult<TOutput>>;

export const buildAdaptivePlugin = <
  TInput,
  TOutput,
  TConfig extends Record<string, unknown>,
  TKind extends PluginKind,
>(
  config: {
    readonly name: string;
    readonly stage: PluginStage;
    readonly role: PluginRole;
    readonly kind: TKind;
    readonly dependencies: readonly PluginDependency[];
    readonly tags: readonly string[];
    readonly profile: {
      readonly latencyMs: number;
      readonly mandatory: boolean;
    };
    readonly pluginConfig: TConfig;
    readonly run: BuildPluginRun<TInput, TOutput>;
  },
): AnyAdaptivePluginDefinition => {
  const definition = buildPluginDefinition(automationCatalogNamespace, config.kind as any, {
    name: config.name,
    version: automationVersion,
    tags: config.tags,
    dependencies: config.dependencies,
    pluginConfig: config.pluginConfig,
    run: config.run as PluginDefinition<TInput, TOutput, TConfig, TKind>['run'],
  });

  return {
    ...definition,
    namespace: automationCatalogNamespace,
    stage: config.stage,
    role: config.role,
    profile: config.profile,
  } as AnyAdaptivePluginDefinition;
};

type PlanSignal = {
  readonly name: string;
  readonly unit: string;
  readonly source: string;
  readonly value: number;
  readonly at: string;
  readonly dimensions: Readonly<Record<string, string>>;
};

type SignalDiscoveryInput = {
  readonly scenario: string;
  readonly tenantId: TenantId;
};

type SignalDiscoveryOutput = {
  readonly scenario: string;
  readonly tenantId: TenantId;
  readonly signals: readonly PlanSignal[];
};

type PlanPayload = {
  readonly node: string;
  readonly policy: string;
  readonly observed: number;
};

type PlanOutput = CampaignPlan<PlanPayload>;

type AllocatorInput = PlanOutput;

type AllocatorOutput = CampaignEnvelope<PlanOutput, { readonly stage: PluginStage }>;

type VerifierInput = AllocatorOutput;

type VerifierOutput = CampaignRunResult<PlanOutput>;

type SynthesizeInput = VerifierOutput;

type SynthesizeOutput = VerifierOutput;

const plannerSignalsPlugin = buildAdaptivePlugin<SignalDiscoveryInput, SignalDiscoveryOutput, {
  readonly limit: number;
  readonly strategy: string;
}, typeof planningPluginKind>({
  name: 'signal-discovery',
  stage: 'ingest',
  role: 'planner',
  kind: planningPluginKind,
  dependencies: [],
  tags: ['planner', 'ingest'],
  profile: { latencyMs: 8, mandatory: true },
  pluginConfig: { limit: 64, strategy: 'graph' },
  run: async (_context, input: SignalDiscoveryInput) => {
    const signals = Array.from({ length: 8 }, (_, index) => {
      const value = (index * 7 + 11) % 100;
      return {
        name: `${input.scenario}-signal-${index}`,
        unit: 'score',
        source: 'recovery-lab-adaptive',
        value,
        at: new Date().toISOString(),
        dimensions: {
          tenant: String(input.tenantId),
          source: 'signal-discovery',
          mode: 'ingest',
        },
      } satisfies PlanSignal;
    });

    return {
      ok: true,
      value: {
        scenario: input.scenario,
        tenantId: input.tenantId,
        signals,
      },
      generatedAt: new Date().toISOString(),
    };
  },
});

type PlanStep = {
  readonly stepId: CampaignStepId;
  readonly intent: BrandInput<string>;
  readonly action: string;
  readonly expectedDurationMinutes: number;
  readonly constraints: readonly {
    readonly key: string;
    readonly operator: 'gte';
    readonly threshold: number;
    readonly severity: number;
  }[];
  readonly dependencies: readonly BrandInput<string>[];
  readonly payload: PlanPayload;
  readonly tags: readonly string[];
};

const plannerChainPlugin = buildAdaptivePlugin<SignalDiscoveryOutput, PlanOutput, { readonly policy: string; readonly maxDepth: number }, typeof planningPluginKind>({
  name: 'plan-assembler',
  stage: 'plan',
  role: 'planner',
  kind: planningPluginKind,
  dependencies: ['dep:recovery:incident:planner'],
  tags: ['planner', 'compose'],
  profile: { latencyMs: 13, mandatory: true },
  pluginConfig: { policy: 'baseline', maxDepth: 3 },
  run: async (_context, input: SignalDiscoveryOutput) => {
    const steps = input.signals
      .toSorted((left, right) => left.value.toString().localeCompare(right.value.toString()))
      .map((signal, index) => ({
        stepId: asCampaignStepId(`step-${input.scenario}-${index}`),
        intent: asCampaignDependency(`intent:${signal.name}`),
        action: 'validate',
        expectedDurationMinutes: (index + 1) * 3,
        constraints: [
          {
            key: signal.name,
            operator: 'gte',
            threshold: signal.value,
            severity: index,
          },
        ],
        dependencies: index > 0 ? [asCampaignDependency(`intent:${input.signals[index - 1].name}`)] : [],
        payload: {
          node: signal.name,
          policy: 'slo',
          observed: signal.value,
        },
        tags: [signal.name],
      }) satisfies PlanStep);

    const plan: PlanOutput = {
      tenantId: input.tenantId,
      campaignId: asCampaignId(`campaign-${input.scenario}`),
      planId: asPlanId(`plan-${input.scenario}`),
      title: `${input.scenario} control plan`,
      createdBy: 'planner-plugin',
      mode: 'simulate',
      steps,
      riskProfile: (input.signals.length % 11) * 9,
      signalPolicy: ['ingest', 'plan', 'execute'],
    };

    return {
      ok: true,
      value: plan,
      generatedAt: new Date().toISOString(),
    };
  },
});

const allocatorPlugin = buildAdaptivePlugin<AllocatorInput, AllocatorOutput, { readonly strategy: string; readonly maxWorkers: number }, typeof executionPluginKind>({
  name: 'allocation-balancer',
  stage: 'execute',
  role: 'allocator',
  kind: executionPluginKind,
  dependencies: ['dep:recovery:incident:planner'],
  tags: ['executor', 'allocator'],
  profile: { latencyMs: 9, mandatory: false },
  pluginConfig: { strategy: 'least-loaded', maxWorkers: 8 },
  run: async (context, input: AllocatorInput) => {
    const envelope: AllocatorOutput = {
      runId: `run-${context.requestId}` as any,
      campaignId: input.campaignId,
      planId: input.planId,
      tenantId: input.tenantId,
      mode: 'execute',
      context: { stage: 'execute' },
      payload: {
        ...input,
        steps: input.steps.slice(0, context.requestId.length),
      },
    };

    return {
      ok: true,
      value: envelope,
      generatedAt: new Date().toISOString(),
    };
  },
});

const verifierPlugin = buildAdaptivePlugin<VerifierInput, VerifierOutput, { readonly checks: number }, typeof verifyPluginKind>({
  name: 'verification-gate',
  stage: 'verify',
  role: 'auditor',
  kind: verifyPluginKind,
  dependencies: ['dep:recovery:incident:execution'],
  tags: ['auditor', 'verify'],
  profile: { latencyMs: 11, mandatory: true },
  pluginConfig: { checks: 5 },
  run: async (_context, input: VerifierInput) => {
    const ok = input.payload.steps.length > 0 && input.payload.title.includes('plan');

    const diagnostic: CampaignDiagnostic = {
      id: asPluginExecutionId(`${input.runId}:verify`),
      phase: 'verify',
      pluginId: asDiagnosticsPluginId('verify/diagnostic-check'),
      at: new Date().toISOString(),
      source: 'verification-gate',
      message: 'stage-verify passed',
      tags: ['verify', 'gate'],
    };

    const output: VerifierOutput = {
      runId: input.runId,
      campaignId: input.campaignId,
      stage: 'verify',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      ok,
      output: input.payload,
      diagnostics: [diagnostic],
    };

    return {
      ok,
      value: output,
      generatedAt: new Date().toISOString(),
      errors: ok ? undefined : ['verification failed'],
    } as const;
  },
});

const synthesizerPlugin = buildAdaptivePlugin<SynthesizeInput, SynthesizeOutput, { readonly templates: readonly string[] }, typeof synthesizePluginKind>({
  name: 'synthesize-runbook',
  stage: 'synthesize',
  role: 'summarizer',
  kind: synthesizePluginKind,
  dependencies: ['dep:recovery:incident:verification'],
  tags: ['summarize', 'synthesize'],
  profile: { latencyMs: 6, mandatory: false },
  pluginConfig: { templates: ['runbook', 'policy', 'report'] },
  run: async (_context, input: SynthesizeInput) => {
    const output: SynthesizeOutput = {
      ...input,
      diagnostics: [
        ...input.diagnostics,
        {
          id: asPluginExecutionId(`${input.runId}:summary`),
          phase: 'synthesize',
          pluginId: asDiagnosticsPluginId('synthesizer'),
          at: new Date().toISOString(),
          source: 'synthesize-runbook',
          message: `summary built for ${input.campaignId}`,
          tags: ['summary', 'synthesize', 'run'],
        },
      ],
      ok: input.ok,
    };

    return {
      ok: true,
      value: output,
      generatedAt: new Date().toISOString(),
    };
  },
});

type CatalogByPhase = {
  readonly ingest: readonly AnyAdaptivePluginDefinition[];
  readonly plan: readonly AnyAdaptivePluginDefinition[];
  readonly execute: readonly AnyAdaptivePluginDefinition[];
  readonly verify: readonly AnyAdaptivePluginDefinition[];
  readonly synthesize: readonly AnyAdaptivePluginDefinition[];
};

type CatalogByRole = {
  readonly planner: readonly AnyAdaptivePluginDefinition[];
  readonly allocator: readonly AnyAdaptivePluginDefinition[];
  readonly executor: readonly AnyAdaptivePluginDefinition[];
  readonly auditor: readonly AnyAdaptivePluginDefinition[];
  readonly summarizer: readonly AnyAdaptivePluginDefinition[];
};

const pluginChain = [
  plannerSignalsPlugin,
  plannerChainPlugin,
  allocatorPlugin,
  verifierPlugin,
  synthesizerPlugin,
] as const;

const catalogByPhaseMap: { [K in PluginStage]: AnyAdaptivePluginDefinition[] } = {
  ingest: [],
  plan: [],
  execute: [],
  verify: [],
  synthesize: [],
};

for (const plugin of pluginChain) {
  catalogByPhaseMap[plugin.stage].push(plugin);
}

const catalogByRoleMap: CatalogByRole = {
  planner: pluginChain.filter((entry) => entry.role === 'planner'),
  allocator: pluginChain.filter((entry) => entry.role === 'allocator'),
  executor: pluginChain.filter((entry) => entry.role === 'executor'),
  auditor: pluginChain.filter((entry) => entry.role === 'auditor'),
  summarizer: pluginChain.filter((entry) => entry.role === 'summarizer'),
};

export const automationPluginCatalog = {
  phases: pluginChain,
  roleCatalog: catalogByRoleMap,
  namespace: automationCatalogNamespace,
} as const;

export const catalogByPhase: CatalogByPhase = catalogByPhaseMap;

export type AutomationPluginCatalog = typeof automationPluginCatalog;
export type CatalogPhase = keyof typeof catalogByPhase;

const createContext = (tenantId: TenantId, stage: PluginStage): PluginContext<Record<string, unknown>> => ({
  tenantId,
  requestId: `${tenantId}:${stage}:${Date.now()}`,
  namespace: automationCatalogNamespace,
  startedAt: new Date().toISOString(),
  config: { stage },
});

export const executeAdaptiveCatalog = async <
  const TSeed extends Record<string, string>,
>(tenantId: TenantId, seed: TSeed): Promise<Record<string, unknown>> => {
  let current = { ...seed } as Record<string, unknown>;

  for (const plugin of pluginChain) {
    const context = createContext(tenantId, plugin.stage);
    const result = await plugin.run(context, current);
    if (result.ok && result.value !== undefined) {
      current = result.value as Record<string, unknown>;
    }
  }

  return current;
};

export const executeAdaptiveChain = async (
  tenantId: string,
  initial: Record<string, unknown>,
  chain: readonly AnyAdaptivePluginDefinition[],
): Promise<{ readonly value: Record<string, unknown>; readonly ok: boolean; readonly generatedAt: string; readonly errors?: readonly string[] }> => {
  let current = initial as unknown;

  for (const plugin of chain) {
    const context = createContext(tenantId as TenantId, plugin.stage);
    const result = await plugin.run(context, current as never);

    if (!result.ok || result.value === undefined) {
      return {
        value: initial,
        ok: false,
        generatedAt: new Date().toISOString(),
        errors: result.errors,
      };
    }

    current = result.value;
  }

  return {
    value: current as Record<string, unknown>,
    ok: true,
    generatedAt: new Date().toISOString(),
  };
};

export const executePlanChain = async (
  tenantId: string,
  plan: PlanOutput,
): Promise<{ readonly ok: boolean; readonly value: Record<string, unknown>; readonly generatedAt: string; readonly errors?: readonly string[] }> => {
  const input = {
    scenario: plan.title,
    tenantId: plan.tenantId,
    plan,
  } as Record<string, unknown>;

  return executeAdaptiveChain(tenantId, input, automationPluginCatalog.phases);
};
