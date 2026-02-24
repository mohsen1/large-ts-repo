import { randomUUID } from 'node:crypto';
import { ok, fail, type Result } from '@shared/result';
import type {
  OrchestrationLab,
  OrchestrationLabEnvelope,
  OrchestrationPolicy,
  OrchestrationLabId,
  PlanScore,
  LabRunId,
  LabPlan,
  LabPlanId,
  LabSignal,
  CommandPolicyId,
  LabSignalTier,
  LabStep,
} from '@domain/recovery-ops-orchestration-lab';
import {
  buildExecutionDigest,
  emitTelemetrySnapshot,
  splitSignals,
  reduceSignalScore,
  buildLabGraph,
  buildGraphDiagnostics,
  buildLabWorkspace,
} from '@domain/recovery-ops-orchestration-lab';
import {
  optimizeWithPolicy,
  buildProfiles,
  buildPlanConfig,
  chainPipeline,
  type RecoveryOpsOptimizationResult,
  type PipelineOutput,
  type PipelineInput,
} from './strategy-pipeline';
import type {
  CommandOrchestrationResult,
  CommandSelectionCriteria,
  CommandSurface,
  CommandSignal,
  CommandSurfaceId,
  CommandPlanProfile,
  CommandPlanId,
  CommandWindowId,
  CommandSignalId,
  CommandWave,
  CommandWaveStep,
  CommandWaveStepId,
  CommandExecutionDependency,
  CommandRisk,
  RecoveryCommandPhase,
  ExecutionWaveId,
} from '@domain/recovery-ops-orchestration-surface';
import { buildPolicyTag } from '@domain/recovery-ops-orchestration-lab/src/contracts';
import { RecoveryOpsOrchestrationLabStore } from '@data/recovery-ops-orchestration-lab-store';
import { RecoveryOpsOrchestrationStore } from '@data/recovery-ops-orchestration-store';

type CommandPolicyBrand = OrchestrationPolicy['id'];

const asCommandPolicyId = (value: string): CommandPolicyBrand => value as CommandPolicyBrand;
const asLabPlanId = (value: string): LabPlanId => value as LabPlanId;
const asCommandPlanId = (value: string): CommandPlanId => value as CommandPlanId;
const asCommandSignalId = (value: string): CommandSignalId => value as CommandSignalId;
const asCommandSurfaceId = (value: string): CommandSurfaceId => value as CommandSurfaceId;
const asCommandWindowId = (value: string): CommandWindowId => value as CommandWindowId;
const asExecutionWaveId = (value: string): ExecutionWaveId => value as ExecutionWaveId;
const asCommandWaveStepId = (value: string): CommandWaveStepId => value as CommandWaveStepId;

const toBrandFromLabId = <T>(value: string): T => value as T;

export interface RuntimeRunContext {
  readonly contextId: string;
  readonly tenant: string;
  readonly policy: OrchestrationPolicy;
  readonly requestedBy: string;
}

export interface OrchestratedLabRun {
  readonly runId: LabRunId;
  readonly labId: OrchestrationLabId;
  readonly commandResult: CommandOrchestrationResult;
  readonly score: PlanScore;
  readonly envelope: OrchestrationLabEnvelope;
  readonly diagnostics: {
    readonly graphNodes: number;
    readonly graphEdges: number;
    readonly cycleCount: number;
    readonly telemetry: string;
  };
}

export interface OrchestratedWorkspace {
  readonly context: RuntimeRunContext;
  readonly planId?: LabPlan['id'];
  readonly profiles: ReturnType<typeof buildProfiles>;
  readonly pipeline: PipelineOutput;
}

export interface EngineSurface {
  readonly commandSelection: CommandSelectionCriteria;
  readonly commandResult: CommandOrchestrationResult;
  readonly lab: OrchestrationLab;
}

const nowIso = (): string => new Date().toISOString();

const resolveCommandRisk = (risk: number): CommandRisk => {
  if (risk >= 0.9) {
    return 'critical';
  }
  if (risk >= 0.7) {
    return 'high';
  }
  if (risk >= 0.4) {
    return 'medium';
  }
  return 'low';
};

const asCommandPhase = (tier: LabSignalTier): RecoveryCommandPhase => {
  if (tier === 'critical') {
    return 'validate';
  }
  if (tier === 'warning') {
    return 'stabilize';
  }
  return 'observe';
};

const commandSignal = (input: LabSignal): CommandSignal => ({
  id: asCommandSignalId(input.id),
  source: input.source,
  phase: asCommandPhase(input.tier),
  confidence: input.score / 100,
  impactScore: input.score,
  createdAt: input.createdAt,
  labels: input.tags.map((tag) => `${tag.key}:${tag.value}`),
  metadata: { lab: input.labId },
});

const commandStepsFromPlan = (plan: LabPlan, policy: OrchestrationPolicy): readonly CommandWaveStep[] =>
  plan.steps.map((step, index): CommandWaveStep => {
    const dependencyKey = `${plan.id}:dep:${index}`;
    const dependency: CommandExecutionDependency = {
      dependsOnStepId: toBrandFromLabId<CommandWaveStepId>(`${plan.id}:dependency:${index}`),
      kind: 'must-run-before',
      rationale: 'step ordering derived from lab risk envelope',
    };

    const slaMinutes = Math.max(step.expectedMinutes + policy.minWindowMinutes, 1);
    return {
      id: asCommandWaveStepId(`${step.id}:cmd`),
      name: `${step.name}`,
      phase: asCommandPhaseFromStepType(step.type),
      commandTemplate: step.command,
      owner: step.owner,
      estimatedMinutes: step.expectedMinutes,
      slaMinutes,
      criticality: resolveCommandRisk(step.risk / 10),
      dependencies: [dependency],
      tags: step.tags,
      runbookRefs: [dependencyKey],
    };
  });

const commandWave = (lab: OrchestrationLab, plan: LabPlan, policy: OrchestrationPolicy): CommandWave => {
  const stepCount = plan.steps.length;
  const duration = plan.steps.reduce((acc, step) => acc + step.expectedMinutes, 0);

  return {
    id: asExecutionWaveId(`${plan.id}:wave`),
    planId: asCommandPlanId(plan.id),
    name: `wave-${plan.title}`,
    steps: commandStepsFromPlan(plan, policy),
    expectedDurationMinutes: Math.max(duration, 1),
    parallelism: Math.max(1, stepCount),
    ownerTeam: plan.steps[0]?.owner ?? lab.tenantId,
    isCritical: plan.steps.some((step) => step.risk > 0.6),
  };
};

const commandPlan = (lab: OrchestrationLab, plan: LabPlan, policy: OrchestrationPolicy): CommandPlanProfile => {
  const risks = plan.steps.map((step) => step.risk / 10);
  const avgRisk = risks.length === 0 ? 0 : risks.reduce((acc, risk) => acc + risk, 0) / risks.length;
  const labels = plan.steps.flatMap((step) => step.tags);

  return {
    id: asCommandPlanId(plan.id),
    surfaceId: asCommandSurfaceId(`${lab.id}:surface`),
    intent: 'containment',
    objectiveSummary: plan.description,
    priority: plan.steps.length,
    riskLevel: resolveCommandRisk(avgRisk),
    waves: [commandWave(lab, plan, policy)],
    createdAt: nowIso(),
    owner: lab.tenantId,
    tenant: lab.tenantId,
    labels,
  };
};

const commandSurface = (lab: OrchestrationLab, policy: OrchestrationPolicy, selectedPlanId?: CommandPlanId): CommandSurface => {
  const plans = lab.plans.map((plan) => commandPlan(lab, plan, policy));
  const availablePlans = [...plans].toSorted((left, right) => {
    const riskCompare = resolveCommandRiskToScore(right.riskLevel) - resolveCommandRiskToScore(left.riskLevel);
    if (riskCompare !== 0) {
      return riskCompare;
    }
    return right.priority - left.priority;
  });

  return {
    id: asCommandSurfaceId(`${lab.id}:surface`),
    tenantId: lab.tenantId,
    scenarioId: lab.scenarioId,
    signals: lab.signals.map(commandSignal),
    availablePlans: plans,
    runtimeWindow: {
      id: asCommandWindowId(`${lab.id}:runtime`),
      start: nowIso(),
      end: new Date(Date.now() + policy.minWindowMinutes * 60_000).toISOString(),
      timezone: 'UTC',
      blackoutWindows: [],
      targetRecoveryMinutes: policy.minWindowMinutes,
    },
    metadata: {
      owner: policy.id as unknown as string,
      region: 'global',
      runbookVersion: '1.0',
      environment: 'prod',
    },
  };
};

const resolveCommandRiskToScore = (risk: CommandRisk): number =>
  risk === 'critical'
    ? 4
    : risk === 'high'
      ? 3
      : risk === 'medium'
        ? 2
        : 1;

const buildSelection = (lab: OrchestrationLab, policy: OrchestrationPolicy): CommandSelectionCriteria => ({
  preferredPhases: ['observe', 'validate', 'stabilize'] as const,
  mandatoryTags: lab.signals.map((signal) => signal.tier),
  maxPlanMinutes: policy.timeoutMinutes,
  minConfidence: policy.minConfidence,
  riskTolerance: 'low',
});

const baselineScore = (lab: OrchestrationLab, commandResult: CommandOrchestrationResult, planScore?: PlanScore): string => {
  const scoreLine = Number(commandResult.score).toFixed(3);
  const signalWeight = splitSignals(lab.signals);
  const baseline = reduceSignalScore(signalWeight[0], signalWeight[1]).toFixed(2);
  const control = planScore ? Number(planScore.controlImpact).toFixed(3) : '0.000';
  return `${commandResult.chosenPlanId}::${scoreLine}::${baseline}::${control}`;
};

const pickPlanId = (lab: OrchestrationLab): LabPlan['id'] | undefined => lab.plans[0]?.id;

const summarizeSteps = (steps: readonly LabPlan['steps'][number][]): string =>
  steps
    .map((step) => `${step.id}:${step.owner}:${step.reversible ? 'rev' : 'norev'}`)
    .toSorted()
    .join(',');

const runSnapshot = (plan: LabPlan): { readonly steps: number; readonly confidence: string; readonly owner: string } => {
  const owners = new Map<string, number>();
  for (const step of plan.steps) {
    owners.set(step.owner, (owners.get(step.owner) ?? 0) + 1);
  }

  const topOwner = [...owners.entries()].reduce<[string, number] | undefined>(
    (acc, current) => (acc && acc[1] >= current[1] ? acc : current),
    undefined,
  )?.[0] ?? 'unknown';

  return {
    steps: plan.steps.length,
    confidence: plan.confidence.toFixed(2),
    owner: topOwner,
  };
};

const buildScores = (lab: OrchestrationLab, policy: OrchestrationPolicy): readonly PlanScore[] => {
  const profiles = buildProfiles([policy]);
  const optimization = optimizeWithPolicy(lab, policy, profiles[0]);
  return optimization.scores;
};

const buildCommandResult = (
  lab: OrchestrationLab,
  policy: OrchestrationPolicy,
  selectedPlan: LabPlan | undefined,
): CommandOrchestrationResult => {
  const selectedPlanId = asCommandPlanId((selectedPlan?.id ?? `none-${lab.id}`) as string);
  const waves = selectedPlan ? [commandWave(lab, selectedPlan, policy)] : [];

  return {
    ok: Boolean(selectedPlan),
    chosenPlanId: selectedPlanId,
    score: selectedPlan?.score ?? 0,
    riskScore: selectedPlan ? selectedPlan.steps.reduce((acc, step) => acc + step.risk, 0) : 0,
    projectedCompletionAt: nowIso(),
    coverage: waves[0]?.steps.length
      ? [
          {
            phase: 'observe',
            coveredStepCount: waves[0]?.steps.length ?? 0,
            totalStepCount: Math.max(waves[0]?.steps.length ?? 0, 1),
          },
        ]
      : [],
    blockers: [selectedPlan ? 'policy-ok' : 'no-plan'],
    surface: commandSurface(lab, policy, selectedPlanId),
  };
};

const runPipelineContext = async (policy: OrchestrationPolicy, lab: OrchestrationLab): Promise<PipelineOutput> => {
  const stages = [
    {
      id: `step-profile-${policy.id}` as PipelineOutput['id'],
      run: async (input: object, context: { runId: string; startedAt: string }) => {
        const contextInput = input as PipelineInput;
        return {
          runId: `${context.runId}:${contextInput.id}`,
        stage: `policy=${contextInput.policy.id}`,
        };
      },
    },
  ] as const;

  const workspace = buildLabWorkspace({
    lab,
    policy,
  });

  buildPlanConfig(policy);
  void workspace;

  return chainPipeline(stages, {
    id: `pipeline-${randomUUID()}` as PipelineOutput['id'],
    lab,
    policy,
    snapshot: workspace.envelope,
  });
};

export const executeOrchestratedLab = async (
  lab: OrchestrationLab,
  policy: OrchestrationPolicy,
  context: RuntimeRunContext,
): Promise<Result<OrchestratedLabRun, Error>> => {
  const stores = {
    lab: new RecoveryOpsOrchestrationLabStore(),
    command: new RecoveryOpsOrchestrationStore(),
  };
  const runId = randomUUID() as LabRunId;

  const upsert = stores.lab.upsertEnvelope({
    id: `${lab.id}:engine:${runId}` as OrchestrationLabEnvelope['id'],
    state: 'draft',
    lab,
    intent: {
      tenantId: lab.tenantId,
      siteId: context.tenant,
      urgency: lab.signals.some((signal) => signal.tier === 'critical') ? 'critical' : 'normal',
      rationale: 'execute-orchestrated-lab',
      owner: context.requestedBy,
      requestedAt: nowIso(),
      tags: ['service', 'orchestrated'],
    },
    plans: lab.plans,
    windows: lab.windows,
    metadata: {
      source: 'service',
      runId,
      commandPolicy: asCommandPolicyId(policy.id),
    },
    revision: lab.plans.length,
  });

  if (!upsert.ok) {
    return fail(upsert.error);
  }

  const scores = buildScores(lab, policy);
  const best = scores.reduce<PlanScore | undefined>((acc, current) => {
    if (!acc || current.readiness > acc.readiness) {
      return current;
    }
    return acc;
  }, undefined) ?? {
    labId: lab.id,
    planId: pickPlanId(lab) ?? asLabPlanId(`${lab.id}:fallback`),
    readiness: 0,
    resilience: 0,
    complexity: 0,
    controlImpact: 0,
    timestamp: nowIso(),
  };

  const selectedPlan = lab.plans.find((entry) => entry.id === best.planId) ?? lab.plans[0];
  const commandResult = buildCommandResult(lab, policy, selectedPlan);

  const persist = stores.command.recordRun({
    id: `${runId}`,
    planId: String(commandResult.chosenPlanId),
    surface: commandResult.surface,
    result: commandResult,
    selected: true,
    notes: ['orchestrated', `tenant=${lab.tenantId}`],
  });

  if (!persist.ok) {
    return fail(persist.error);
  }

  const graph = buildLabGraph(lab);
  const diagnostics = buildGraphDiagnostics(graph);
  const score = baselineScore(lab, commandResult, best);

  await stores.lab.recordRun({
    runId,
    labId: lab.id,
    planId: asLabPlanId(String(commandResult.chosenPlanId)),
    startedAt: nowIso(),
    status: 'running',
    logs: [
      `plan=${commandResult.chosenPlanId}`,
      `score=${score}`,
    ],
  });

  const workspace = {
    context,
    planId: selectedPlan?.id,
    profiles: buildProfiles([policy]),
    pipeline: await runPipelineContext(policy, lab),
  } satisfies OrchestratedWorkspace;

  return ok({
    runId,
    labId: lab.id,
    commandResult,
    score: best,
    envelope: upsert.value.envelope,
    diagnostics: {
      graphNodes: graph.nodes.length,
      graphEdges: graph.edges.length,
      cycleCount: diagnostics.cycleCount,
      telemetry: `tenant=${context.tenant} workspace=${workspace.planId ?? 'none'} selected=${workspace.planId ?? 'none'} pipeline=${workspace.pipeline.state}`,
    },
  });
};

const buildSnapshotDigest = (score: PlanScore, commandResult: CommandOrchestrationResult): string => {
  const baseline = Number(score.controlImpact + score.readiness).toFixed(2);
  return `${String(commandResult.chosenPlanId)}::${commandResult.score.toFixed(3)}::${baseline}`;
};

export const mapWorkspaceTelemetry = (lab: OrchestrationLab, plan: LabPlan, result: CommandOrchestrationResult): string => {
  const signalWeight = splitSignals(lab.signals);
  const score = reduceSignalScore(signalWeight[0], signalWeight[1]);
  return `plan=${plan.title}; signals=${lab.signals.length}; score=${score.toFixed(3)}; result=${result.ok ? 'ok' : 'blocked'}`;
};

export const describeOrchestrationRun = (lab: OrchestrationLab, result: OrchestratedLabRun): string => {
  const snapshot = buildLabWorkspace({
    lab,
    policy: policyFromId('recovery:policy'),
  });

  const summary = `run=${String(result.runId)} plans=${snapshot.envelope.plans.length} selected=${snapshot.selectedPlan?.id ?? 'none'}`;
  return `${summary}\n${emitTelemetrySnapshot(lab)}\n${summarizeSteps(result.envelope.plans[0]?.steps ?? [])}`;
};

const policyFromId = (value: string): OrchestrationPolicy => ({
  id: asCommandPolicyId(value),
  tenantId: 'tenant-global',
  maxParallelSteps: 1,
  minConfidence: 0.1,
  allowedTiers: ['signal'],
  minWindowMinutes: 1,
  timeoutMinutes: 1,
});

export const buildEngineSurface = (lab: OrchestrationLab, selectedPlan?: LabPlan): EngineSurface => {
  const criteria = buildSelection(lab, {
    id: asCommandPolicyId('build-engine-surface'),
    tenantId: lab.tenantId,
    maxParallelSteps: Math.max(1, selectedPlan?.steps.length ?? 1),
    minConfidence: 0.4,
    allowedTiers: ['signal', 'warning'],
    minWindowMinutes: 5,
    timeoutMinutes: 120,
  });

  return {
    commandSelection: criteria,
    commandResult: buildCommandResult(lab, policyFromId('build-engine-surface'), selectedPlan),
    lab,
  };
};

export const buildRunDigest = (
  lab: OrchestrationLab,
  plan: LabPlan,
  run: OrchestratedLabRun,
): ReturnType<typeof describeOrchestrationRun> => {
  const detail = describeOrchestrationRun(lab, run);
  const scoreLine = `plan=${plan.title} confidence=${plan.confidence.toFixed(2)} steps=${plan.steps.length} commandScore=${run.score.readiness.toFixed(2)}`;
  return `${detail}\n${scoreLine}`;
};

export const withRuntimeContext = async <T>(
  context: RuntimeRunContext,
  fn: (context: RuntimeRunContext) => Promise<T>,
): Promise<T> => {
  const snapshot = {
    ...context,
    contextId: `${context.contextId}:${Date.now()}`,
  };
  return fn(snapshot);
};

export const collectExecutionDigest = (run: OrchestratedLabRun): readonly string[] => {
  const digest = buildExecutionDigest(
    {
      id: run.runId,
      planId: asLabPlanId(run.commandResult.chosenPlanId),
      labId: run.labId,
      startedAt: nowIso(),
      completedAt: nowIso(),
      status: 'running',
      stepCount: 0,
      logs: ['collect'],
      metadata: { selectedPlanId: run.commandResult.chosenPlanId },
    },
    buildLabGraph(run.envelope.lab),
    run.envelope.plans,
  );

  const runDetails = {
    runId: run.runId,
    selected: run.commandResult.chosenPlanId,
    cycles: run.diagnostics.cycleCount,
    nodes: digest.nodes,
    durationSeconds: digest.durationSeconds,
  };

  return [
    `run=${runDetails.runId}`,
    `selected=${runDetails.selected}`,
    `cycles=${runDetails.cycles}`,
    `nodes=${runDetails.nodes}`,
    `duration=${runDetails.durationSeconds}`,
  ].toSorted();
};

export { runSnapshot, buildSnapshotDigest };

const asCommandPhaseFromStepType = (stepType: LabStep['type']): RecoveryCommandPhase => {
  if (stepType === 'detect') {
    return 'observe';
  }
  if (stepType === 'assess') {
    return 'validate';
  }
  if (stepType === 'contain') {
    return 'stabilize';
  }
  if (stepType === 'recover') {
    return 'scale';
  }
  return 'handoff';
};
