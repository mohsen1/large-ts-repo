import type { Brand } from '@shared/type-level';
import type {
  OrchestrationLab,
  OrchestrationLabEnvelope,
  LabPlan,
  PlanScore,
  OrchestrationPolicy,
} from '@domain/recovery-ops-orchestration-lab';
import {
  optimizePlanSelection,
  type OptimizationConstraint,
  type OptimizationResult,
} from '@domain/recovery-ops-orchestration-lab';

export type PipelineStepId = Brand<string, 'PipelineStepId'>;
export type PipelineState = 'idle' | 'running' | 'blocked' | 'finished' | 'failed';

export interface PipelineInput {
  readonly id: PipelineStepId;
  readonly lab: OrchestrationLab;
  readonly policy: OrchestrationPolicy;
  readonly snapshot: OrchestrationLabEnvelope;
}

export interface PipelineOutput {
  readonly id: PipelineStepId;
  readonly state: PipelineState;
  readonly message: string;
  readonly plan?: LabPlan;
  readonly score?: number;
  readonly selectedPlanId?: LabPlan['id'];
  readonly strategy: string;
  readonly diagnostics: readonly string[];
  readonly result?: RecoveryOpsOptimizationResult;
}

interface StepContext {
  readonly runId: string;
  readonly startedAt: string;
}

export type PipelineStageResult<TContext extends object = object, TOutput = unknown> = {
  readonly context: TContext;
  readonly output: TOutput;
  readonly diagnostics: readonly string[];
};

export interface PipelineStage<I extends object, O extends object> {
  readonly id: PipelineStepId;
  readonly run: (input: I, context: StepContext) => Promise<O>;
}

export type PipelineTuple<TStages extends readonly PipelineStage<object, object>[]> = readonly [...TStages];
export type PipelineResult<TStages extends readonly PipelineStage<object, object>[]> = PipelineOutput;

export interface PipelineDiagnostics {
  readonly totalStages: number;
  readonly state: PipelineState;
  readonly timings: ReadonlyMap<PipelineStepId, number>;
}

export interface RecoveryOpsOptimizationResult {
  readonly envelope: OrchestrationLabEnvelope;
  readonly optimization: OptimizationResult;
  readonly scores: readonly PlanScore[];
  readonly summary: string;
}

const now = (): string => new Date().toISOString();
const withPipelineId = (value: string): PipelineStepId => value as PipelineStepId;

export interface PlanConfig {
  readonly maxSteps: number;
  readonly includeAutomatedOnly: boolean;
  readonly minReversibleRatio: number;
}

export interface StrategyProfile {
  readonly policy: {
    readonly id: string;
    readonly name: string;
    readonly rules: readonly {
      readonly ruleId: string;
      readonly weight: number;
      readonly compare: string;
      readonly threshold: number;
    }[];
    readonly minConfidence: number;
  };
  readonly constraints: OptimizationConstraint;
  readonly scoreTolerance: number;
}

const inferPolicy = (policy: OrchestrationPolicy): PlanConfig => ({
  maxSteps: policy.maxParallelSteps,
  includeAutomatedOnly: false,
  minReversibleRatio: 0.15,
});

const scoreTolerance = (
  result: RecoveryOpsOptimizationResult,
  profile: StrategyProfile,
): number => {
  const base = result.optimization.ranked.length > 0
    ? result.optimization.rejected.length / Math.max(1, result.optimization.ranked.length)
    : 0;
  const weight = Math.max(1, profile.scoreTolerance);
  return Number((base / weight).toFixed(3));
};

const collectDiagnostics = (phase: string, diagnostics: readonly string[]): readonly string[] => [
  `${now()}:${phase}`,
  ...diagnostics,
];

export const normalizePolicy = (policy: OrchestrationPolicy): OrchestrationPolicy => ({
  ...policy,
  minConfidence: Math.max(0, Math.min(1, policy.minConfidence)),
  maxParallelSteps: Math.max(1, policy.maxParallelSteps),
  minWindowMinutes: Math.max(1, policy.minWindowMinutes),
  timeoutMinutes: Math.max(1, policy.timeoutMinutes),
});

export const optimizeWithPolicy = (
  lab: OrchestrationLab,
  policy: OrchestrationPolicy,
  profile: StrategyProfile,
): RecoveryOpsOptimizationResult => {
  const normalizedPolicy = normalizePolicy(policy);
  const constraints = inferPolicy(normalizedPolicy);
  const optimization = optimizePlanSelection(lab, normalizedPolicy, constraints);

  const snapshots = optimization.ranked.map((candidate) => ({
    labId: lab.id,
    planId: candidate.candidate.id,
    readiness: candidate.score,
    resilience: candidate.score / Math.max(1, lab.signals.length),
    complexity: candidate.score / 12,
    controlImpact: candidate.score / 18,
    timestamp: now(),
  }));

  const summary = `strategy=${profile.policy.id} selected=${optimization.selectedPlanId ?? 'none'} rejected=${optimization.rejected.length}`;

  const envelope: OrchestrationLabEnvelope = {
    id: `${lab.id}:envelope:${now()}` as OrchestrationLabEnvelope['id'],
    state: 'draft',
    lab,
    intent: {
      tenantId: lab.tenantId,
      siteId: 'site-main',
      urgency: lab.signals.some((signal) => signal.tier === 'critical') ? 'critical' : 'normal',
      rationale: 'policy-driven',
      owner: lab.tenantId,
      requestedAt: now(),
      tags: ['engine', 'policy', 'runtime'],
    },
    plans: lab.plans,
    windows: lab.windows,
    metadata: {
      strategy: profile.policy.id,
      tolerance: scoreTolerance({
        envelope: {
          id: `${lab.id}:summary:${Date.now()}` as OrchestrationLabEnvelope['id'],
          state: 'draft',
          lab,
          intent: {
            tenantId: lab.tenantId,
            siteId: 'site-main',
            urgency: 'normal',
            rationale: 'bootstrap',
            owner: 'engine',
            requestedAt: now(),
            tags: ['bootstrap'],
          },
          plans: lab.plans,
          windows: lab.windows,
          metadata: {},
          revision: 0,
        },
        optimization,
        scores: snapshots,
        summary,
      }, profile),
      profile: profile.policy.id,
    },
    revision: lab.plans.length,
  };

  return {
    envelope,
    optimization,
    scores: snapshots,
    summary,
  };
};

export const runStage = async <
  I extends object,
  O extends object,
>(
  step: PipelineStage<I, O>,
  input: I,
  context: StepContext,
): Promise<PipelineStageResult<StepContext, O>> => {
  const output = await step.run(input, context);
  return {
    context,
    output,
    diagnostics: [`${step.id}`, `at:${context.startedAt}`],
  };
};

export const chainPipeline = async <
  const TPipeline extends readonly PipelineStage<object, object>[],
>(
  pipeline: TPipeline,
  input: PipelineInput,
): Promise<PipelineOutput> => {
  let current: unknown = input;
  const context: StepContext = { runId: input.id, startedAt: now() };
  const stages = pipeline as readonly PipelineStage<object, object>[];

  const timings = new Map<PipelineStepId, number>();
  let state: PipelineState = 'running';
  const messages: string[] = [];

  for (const stage of stages) {
    const started = performance.now();
    const result = await stage.run(current as PipelineInput, context);
    const elapsed = performance.now() - started;
    timings.set(stage.id, elapsed);
    current = result;
    messages.push(`${stage.id}:${String(Boolean(result))}`);
    if (!result) {
      state = 'blocked';
      break;
    }
  }

  const timedMessage = [...timings.values()].reduce((acc, value) => acc + value, 0);

  return {
    id: withPipelineId('pipeline-output'),
    state,
    message: messages.join(' | '),
    strategy: `steps=${stages.length}::${timedMessage.toFixed(2)}ms`,
    diagnostics: collectDiagnostics('pipeline', messages),
    score: timedMessage,
    selectedPlanId: input.lab.plans[0]?.id,
    plan: input.lab.plans[0],
    result: optimizeWithPolicy(input.lab, input.policy, buildProfiles([input.policy])[0]),
  };
};

export const toPipelineDiagnostics = (output: PipelineOutput): PipelineDiagnostics => ({
  totalStages: output.strategy.split('=').length + 1,
  state: output.state,
  timings: new Map(),
});

export const buildPlanConfig = (input: OrchestrationPolicy): PlanConfig => ({
  maxSteps: input.maxParallelSteps,
  includeAutomatedOnly: input.allowedTiers.includes('critical') && !input.allowedTiers.includes('warning'),
  minReversibleRatio: input.minConfidence,
});

export const buildProfiles = (policies: readonly OrchestrationPolicy[]): readonly StrategyProfile[] =>
  policies.map((policy) => ({
    policy: {
      id: policy.id,
      name: 'ops-engine-policy',
      rules: [
        {
          ruleId: 'max-steps',
          weight: 1,
          compare: 'less-than',
          threshold: policy.maxParallelSteps,
        },
      ],
      minConfidence: policy.minConfidence,
    },
    constraints: {
      maxSteps: policy.maxParallelSteps,
      includeAutomatedOnly: false,
      minReversibleRatio: 0.2,
    },
    scoreTolerance: policy.timeoutMinutes,
  }));

export const emptyPipeline = (): PipelineTuple<readonly []> => [];
