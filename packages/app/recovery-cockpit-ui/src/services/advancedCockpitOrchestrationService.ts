import {
  OrchestratorPluginDescriptor,
  OrchestratorPhase,
  OrchestrationGraphPlan,
  OrchestrationRuntimeConfig,
  PluginId,
  RuntimeArtifact,
  RuntimeArtifactPath,
  RuntimeNamespace,
  StageDescriptor,
  StageIdentifier,
  TraceId,
  createRegistry,
  executePlan,
  DEFAULT_PHASES,
  OrchestratorDependencies,
} from '@shared/ops-orchestration-runtime';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { PolicyEvaluation } from '@service/recovery-cockpit-orchestrator';
import { PluginOutput } from '@shared/ops-orchestration-runtime';

export interface ExecutionEnvelope {
  readonly namespace: RuntimeNamespace;
  readonly phase: OrchestratorPhase;
  readonly phaseLabel: `stage:${OrchestratorPhase}`;
  readonly ok: boolean;
  readonly score: number;
  readonly detail: string;
}

type SeedInput = {
  readonly score: number;
  readonly namespace: RuntimeNamespace;
};

type AdvancedPayload = SeedInput & {
  readonly riskScore: number;
  readonly strategy: readonly string[];
  readonly policyAllowed: boolean;
  readonly warnings: readonly string[];
  readonly executed: boolean;
  readonly verified: boolean;
};

const toPluginId = (value: string): PluginId => value as PluginId;
const makeTraceId = (value: string): TraceId => value as TraceId;

const pluginPolicy = (policy: PolicyEvaluation): OrchestratorPluginDescriptor<'policy-gate', 'validate', SeedInput, AdvancedPayload> => ({
  id: toPluginId('plugin:policy-gate'),
  name: 'policy-gate',
  phase: 'validate',
  version: '1.0.0',
  tags: ['policy'],
  dependencies: [],
  canProcess: (input): input is SeedInput => input.score >= 0,
  process: async ({ payload }) => {
    const score = payload.score + (policy.allowed ? 10 : -10);
    const output: AdvancedPayload = {
      score,
      namespace: payload.namespace,
      riskScore: policy.riskScore,
      strategy: ['validate'],
      policyAllowed: policy.allowed,
      warnings: policy.warnings,
      executed: false,
      verified: false,
    };
    const result = {
      accepted: score >= 20,
      stage: 'stage:validate',
      payload: output,
      score,
      warnings: policy.warnings,
      traceId: makeTraceId(`stage:validate:${policy.recommendations.length}`),
    } satisfies PluginOutput<AdvancedPayload>;

    return {
      status: result.accepted ? 'ok' : 'degraded',
      output: result,
      signal: score,
    };
  },
});

const pluginPlanner = (): OrchestratorPluginDescriptor<'planner', 'plan', AdvancedPayload, AdvancedPayload> => ({
  id: toPluginId('plugin:planner'),
  name: 'planner',
  phase: 'plan',
  version: '1.0.0',
  tags: ['planner'],
  dependencies: [toPluginId('plugin:policy-gate')],
  canProcess: (input): input is AdvancedPayload => input.score >= 0,
  process: async ({ payload }) => {
    const output: AdvancedPayload = {
      ...payload,
      score: payload.score + 8,
      strategy: ['execute', 'verify', 'finalize'],
    };
    return {
      status: 'ok',
      output: {
        accepted: true,
        stage: 'stage:plan',
        payload: output,
        score: output.score,
        warnings: output.warnings,
        traceId: makeTraceId(`stage:plan:${payload.namespace}`),
      },
      signal: output.score,
    };
  },
});

const pluginExecutor = (): OrchestratorPluginDescriptor<'executor', 'execute', AdvancedPayload, AdvancedPayload> => ({
  id: toPluginId('plugin:executor'),
  name: 'executor',
  phase: 'execute',
  version: '1.0.0',
  tags: ['executor'],
  dependencies: [toPluginId('plugin:planner')],
  canProcess: (input): input is AdvancedPayload => input.score >= 0,
  process: async ({ payload }) => {
    const output: AdvancedPayload = {
      ...payload,
      score: payload.score + 12,
      executed: true,
    };
    return {
      status: 'ok',
      output: {
        accepted: true,
        stage: 'stage:execute',
        payload: output,
        score: output.score,
        warnings: output.warnings,
        traceId: makeTraceId(`stage:execute:${payload.namespace}`),
      },
      signal: output.score,
    };
  },
});

const pluginVerifier = (): OrchestratorPluginDescriptor<'verifier', 'verify', AdvancedPayload, AdvancedPayload> => ({
  id: toPluginId('plugin:verifier'),
  name: 'verifier',
  phase: 'verify',
  version: '1.0.0',
  tags: ['verifier'],
  dependencies: [toPluginId('plugin:executor')],
  canProcess: (input): input is AdvancedPayload => input.executed,
  process: async ({ payload }) => {
    const output: AdvancedPayload = {
      ...payload,
      score: payload.score + 20,
      verified: true,
    };
    return {
      status: 'ok',
      output: {
        accepted: true,
        stage: 'stage:verify',
        payload: output,
        score: output.score,
        warnings: output.warnings,
        traceId: makeTraceId(`stage:verify:${payload.namespace}`),
      },
      signal: output.score,
    };
  },
});

const pluginFinalizer = (): OrchestratorPluginDescriptor<'finalizer', 'finalize', AdvancedPayload, AdvancedPayload> => ({
  id: toPluginId('plugin:finalizer'),
  name: 'finalizer',
  phase: 'finalize',
  version: '1.0.0',
  tags: ['finalizer'],
  dependencies: [toPluginId('plugin:verifier')],
  canProcess: (input): input is AdvancedPayload => input.verified,
  process: async ({ payload }) => {
    const output: AdvancedPayload = {
      ...payload,
      score: payload.score + 32,
      strategy: [...payload.strategy, 'done'],
    };
    return {
      status: 'ok',
      output: {
        accepted: true,
        stage: 'stage:finalize',
        payload: output,
        score: output.score,
        warnings: output.warnings,
        traceId: makeTraceId(`stage:finalize:${payload.namespace}`),
      },
      signal: output.score,
    };
  },
});

const buildPlugins = (policy: PolicyEvaluation) =>
  createRegistry('recovery-cockpit', [
    pluginPolicy(policy),
    pluginPlanner(),
    pluginExecutor(),
    pluginVerifier(),
    pluginFinalizer(),
  ] as const);

const namespace: RuntimeNamespace = 'namespace:recovery-cockpit' as RuntimeNamespace;

const baseConfig: OrchestrationRuntimeConfig = {
  maxConcurrency: 4,
  timeoutMs: 10_000,
  retryBudget: 2,
  namespace,
  pluginWhitelist: DEFAULT_PHASES.map((phase) => `stage:${phase}` as const),
};

export interface RunResult {
  readonly artifacts: readonly RuntimeArtifact[];
  readonly envelopes: readonly ExecutionEnvelope[];
  readonly runtime: {
    readonly namespace: string;
    readonly phases: readonly OrchestratorPhase[];
    readonly pluginCount: number;
  };
  readonly summary: {
    readonly score: number;
    readonly allowed: boolean;
    readonly riskScore: number;
  };
}

export interface CockpitRuntimePlan extends OrchestrationGraphPlan<RuntimeNamespace, SeedInput, SeedInput, readonly OrchestratorPhase[]> {}

const scorePlan = (plan: RecoveryPlan) => {
  const baseScore = Math.max(1, 100 - plan.actions.reduce((sum, action) => sum + action.expectedDurationMinutes, 0));
  return {
    id: plan.planId,
    score: baseScore,
    namespace,
  };
};

const makePath = (stage: string): RuntimeArtifactPath => `artifact:${stage}` as RuntimeArtifactPath;

const buildPlan = (plan: RecoveryPlan): CockpitRuntimePlan => {
  const input = scorePlan(plan);
  const stageInput: SeedInput = {
    score: input.score,
    namespace,
  };
  const stages = [
    {
      stageId: 'stage:intake' as StageIdentifier,
      stageName: 'stage:intake',
      phase: 'intake' as const,
      requires: ['stage:intake' as StageIdentifier],
      input: stageInput,
      output: stageInput,
      path: makePath('intake'),
    },
    {
      stageId: 'stage:validate' as StageIdentifier,
      stageName: 'stage:validate',
      phase: 'validate' as const,
      requires: ['stage:intake' as StageIdentifier],
      input: stageInput,
      output: stageInput,
      path: makePath('validate'),
    },
    {
      stageId: 'stage:plan' as StageIdentifier,
      stageName: 'stage:plan',
      phase: 'plan' as const,
      requires: ['stage:validate' as StageIdentifier],
      input: stageInput,
      output: stageInput,
      path: makePath('plan'),
    },
    {
      stageId: 'stage:execute' as StageIdentifier,
      stageName: 'stage:execute',
      phase: 'execute' as const,
      requires: ['stage:plan' as StageIdentifier],
      input: stageInput,
      output: stageInput,
      path: makePath('execute'),
    },
    {
      stageId: 'stage:verify' as StageIdentifier,
      stageName: 'stage:verify',
      phase: 'verify' as const,
      requires: ['stage:execute' as StageIdentifier],
      input: stageInput,
      output: stageInput,
      path: makePath('verify'),
    },
    {
      stageId: 'stage:finalize' as StageIdentifier,
      stageName: 'stage:finalize',
      phase: 'finalize' as const,
      requires: ['stage:verify' as StageIdentifier],
      input: stageInput,
      output: stageInput,
      path: makePath('finalize'),
    },
  ] satisfies readonly StageDescriptor[];

  return {
    namespace,
    version: '1.0.0' as any,
    phases: [...DEFAULT_PHASES],
    input: stageInput,
    output: stageInput,
    stages,
  };
};

export class AdvancedCockpitOrchestrationService {
  #registry: ReturnType<typeof buildPlugins>;

  constructor(
    private readonly config: OrchestrationRuntimeConfig,
    registry: ReturnType<typeof buildPlugins>,
  ) {
    this.#registry = registry;
  }

  async runRecoveryPlan(plan: RecoveryPlan, policy: PolicyEvaluation): Promise<RunResult> {
    const stagedPlan = buildPlan(plan);
    const score = scorePlan(plan);
    const dependencies: OrchestratorDependencies = {
      namespace,
      config: this.config,
      plugins: this.#registry,
    };

    const result = await executePlan(
      stagedPlan,
      {
        score: score.score,
        namespace,
      },
      dependencies,
    );

    return {
      artifacts: result.artifacts,
      envelopes: result.history.map((entry) => ({
        namespace: entry.namespace,
        phase: entry.phase,
        phaseLabel: `stage:${entry.phase}`,
        ok: entry.accepted,
        score: entry.score,
        detail: entry.message,
      })),
      runtime: {
        namespace: result.runtime.namespace,
        phases: stagedPlan.phases,
        pluginCount: this.#registry.available.length,
      },
      summary: {
        score: result.history.reduce((acc: number, step) => acc + step.score, 0),
        allowed: policy.allowed,
        riskScore: policy.riskScore,
      },
    };
  }
}

export const createDefaultService = (policy: PolicyEvaluation) =>
  new AdvancedCockpitOrchestrationService(baseConfig, buildPlugins(policy));

export const defaultAdvancedCockpitOrchestrationService = createDefaultService({
  allowed: true,
  checkCount: 0,
  violationCount: 0,
  riskScore: 0,
  warnings: [],
  recommendations: [],
});

export const summarizeSeedPlugins = (workspace: string) => ({
  namespace: workspace,
  count: 5,
  names: ['policy-gate', 'planner', 'executor', 'verifier', 'finalizer'],
});

export const ACTIVE_PLUGIN_NAMES = ['policy-gate', 'planner', 'executor', 'verifier', 'finalizer'];
