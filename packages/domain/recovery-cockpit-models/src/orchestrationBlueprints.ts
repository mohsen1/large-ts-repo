import type { Brand, NoInfer } from '@shared/type-level';
import { toTimestamp } from './identifiers';
import { RecoveryAction, RecoveryPlan } from './runtime';
import { PlanId, EntityId, Region, ServiceCode, UtcIsoTimestamp, EntityRef } from './identifiers';

export type BlueprintId = Brand<string, 'CockpitBlueprintId'>;
export type BlueprintStage = 'discovery' | 'analysis' | 'execution' | 'verification' | 'closure';
export type BlueprintStatus = 'draft' | 'ready' | 'running' | 'completed' | 'stopped' | 'failed';
export type BlueprintLane = 'signal' | 'control' | 'policy' | 'simulation';

export type BlueprintNamespace = `namespace:${string}`;
export type BlueprintName = `blueprint:${string}`;
export type BlueprintKind = `kind:${BlueprintLane}`;
export type BlueprintDependency = `dep:${BlueprintName}`;

export type StageState<T extends BlueprintStage = BlueprintStage> = `stage:${T}`;
export type StageIndex = Brand<number, 'BlueprintStageIndex'>;
export type RiskScore = Brand<number, 'RiskScore'>;

export type BlueprintTemplate<TLane extends BlueprintLane = BlueprintLane> = {
  readonly lane: TLane;
  readonly namespace: BlueprintNamespace;
  readonly labels: ReadonlyArray<string>;
  readonly constraints: ReadonlyArray<`constraint:${string}`>;
};

export type BlueprintStep<I = unknown, O = unknown, TLane extends BlueprintLane = BlueprintLane> =
  BlueprintTemplate<TLane> & {
    readonly stepId: Brand<string, 'BlueprintStepId'>;
    readonly name: BlueprintName;
    readonly stage: BlueprintStage;
    readonly index: StageIndex;
    readonly input: I;
    readonly output: O;
    readonly expectedDurationMinutes: number;
    readonly dependencies: readonly BlueprintDependency[];
    readonly requiredArtifacts: readonly ArtifactId[];
    readonly produces: readonly ArtifactId[];
  };

export type ArtifactId = Brand<string, 'ArtifactId'>;
export type BlueprintArtifact<TPayload = unknown> = {
  readonly artifactId: ArtifactId;
  readonly source: BlueprintName;
  readonly createdAt: UtcIsoTimestamp;
  readonly payload: TPayload;
  readonly score: number;
};

export type RecoveryBlueprint = {
  readonly blueprintId: BlueprintId;
  readonly planId: PlanId;
  readonly namespace: BlueprintNamespace;
  readonly stages: readonly BlueprintStage[];
  readonly steps: readonly BlueprintStep<SignalIntent, SimulationOutput | ControlOutput | PolicyOutput | VerificationOutput>[];
  readonly tags: ReadonlyArray<string>;
  readonly status: BlueprintStatus;
  readonly createdAt: UtcIsoTimestamp;
  readonly riskScore: RiskScore;
};

export type SignalIntent = {
  readonly origin: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly signalIds: readonly string[];
};

export type SimulationOutput = {
  readonly simulationRunId: string;
  readonly confidence: number;
  readonly predictedMinutes: number;
  readonly expectedArtifacts: readonly ArtifactId[];
};

export type ControlOutput = {
  readonly controlRunId: string;
  readonly controlsApplied: readonly string[];
  readonly rollbackPlan: readonly string[];
};

export type PolicyOutput = {
  readonly policyRunId: string;
  readonly evaluatedRules: ReadonlyArray<{ rule: string; result: 'pass' | 'warn' | 'fail' }>;
};

export type VerificationOutput = {
  readonly verificationRunId: string;
  readonly checks: ReadonlyArray<{ key: string; status: 'pass' | 'warn' | 'fail'; details?: string }>;
};

export type BlueprintStepIndex<TBlueprint extends RecoveryBlueprint = RecoveryBlueprint> = {
  [Key in TBlueprint['steps'][number] as Key['stepId']]: Key;
};

export type BlueprintArtifactTypes<TBlueprint extends RecoveryBlueprint = RecoveryBlueprint> = {
  readonly signal: BlueprintArtifact<SignalIntent>;
  readonly simulation: BlueprintArtifact<SimulationOutput>;
  readonly control: BlueprintArtifact<ControlOutput>;
  readonly policy: BlueprintArtifact<PolicyOutput>;
  readonly verification: BlueprintArtifact<VerificationOutput>;
};

export type StepByLane<TSteps extends readonly BlueprintStep[]> = {
  [Step in TSteps[number] as Step['lane']]:
    Extract<TSteps[number], { lane: Step['lane'] }>;
};

export type BlueprintDigest = {
  readonly fingerprint: string;
  readonly stepCount: number;
  readonly stageCount: number;
  readonly firstStage: BlueprintStage;
  readonly lastStage: BlueprintStage;
  readonly risk: number;
};

const defaultRiskScore = 45;
const MAX_STAGE_VARIANTS: readonly BlueprintStage[] = ['discovery', 'analysis', 'execution', 'verification', 'closure'];

const stageForIndex = (index: number): BlueprintStage => {
  return MAX_STAGE_VARIANTS[index % MAX_STAGE_VARIANTS.length]!;
};

const toBlueprintId = (namespace: string, planId: PlanId, phase: BlueprintStage): BlueprintId =>
  `blueprint:${namespace}:${planId}:${phase}:${Date.now()}` as BlueprintId;

const riskToScore = (input: number): number => {
  const bounded = Math.max(0, Math.min(100, Math.round(input)));
  return bounded as RiskScore;
};

const makeArtifactId = (value: string): ArtifactId => `${value}:${Math.random().toString(36).slice(2, 12)}` as ArtifactId;

const dependencyFromStep = (stepId: string, index: number): BlueprintDependency[] => {
  if (index === 0) {
    return [];
  }
  return [`dep:blueprint:${stepId}`];
};

const actionToSignalIntent = (action: RecoveryAction): SignalIntent => ({
  origin: action.serviceCode as string,
  severity: action.tags.includes('critical') ? 'critical' : action.tags.includes('warn') ? 'warning' : 'info',
  signalIds: [action.id, action.region as unknown as string, action.command],
});

const buildControlOutput = (action: RecoveryAction): ControlOutput => ({
  controlRunId: `control:${action.id}`,
  controlsApplied: [action.command, ...action.tags],
  rollbackPlan: [action.id, `${action.region}:rollback`, 'pause'],
});

const buildPolicyOutput = (action: RecoveryAction): PolicyOutput => ({
  policyRunId: `policy:${action.id}`,
  evaluatedRules: [
    {
      rule: 'duration-budget',
      result: action.expectedDurationMinutes <= 60 ? 'pass' : 'warn',
    },
    {
      rule: 'retries-allowed',
      result: action.retriesAllowed > 0 ? 'pass' : 'fail',
    },
  ],
});

const buildVerification = (action: RecoveryAction): VerificationOutput => ({
  verificationRunId: `verify:${action.id}`,
  checks: [
    {
      key: 'state-transition',
      status: action.desiredState === 'up' ? 'pass' : 'warn',
      details: action.region,
    },
    {
      key: 'command-shape',
      status: action.command.length > 0 ? 'pass' : 'fail',
    },
  ],
});

const buildSimulation = (action: RecoveryAction): SimulationOutput => ({
  simulationRunId: `sim:${action.id}`,
  confidence: Number((Math.min(100, 60 + action.retriesAllowed * 10)).toFixed(2)),
  predictedMinutes: Math.max(1, action.expectedDurationMinutes * 2),
  expectedArtifacts: [makeArtifactId(`sim-${action.id}`)],
});

const pickOutput = (action: RecoveryAction): RecoveryBlueprint['steps'][number]['output'] => {
  if (action.tags.includes('policy')) {
    return buildPolicyOutput(action);
  }
  if (action.tags.includes('verify')) {
    return buildVerification(action);
  }
  if (action.tags.includes('simulate')) {
    return buildSimulation(action);
  }
  return buildControlOutput(action);
};

const stepFromAction = <TInput, TOutput>(
  action: RecoveryAction,
  index: number,
  namespace: string,
): BlueprintStep<TInput, TOutput, BlueprintLane> => {
  const output = pickOutput(action);
  const stage = stageForIndex(index);
  return {
    lane: (action.tags.includes('signal') ? 'signal' : 'control') as BlueprintLane,
    namespace: `namespace:${namespace}` as BlueprintNamespace,
    labels: ['auto-generated', action.region as unknown as string, action.serviceCode as unknown as string],
    constraints: ['constraint:no-override', `constraint:tag:${action.tags[0] ?? 'default'}`],
    stepId: `step:${action.id}:${index}` as BlueprintStep<TInput, TOutput>['stepId'],
    name: `blueprint:${action.id}:${index}` as BlueprintName,
    stage,
    index: index as StageIndex,
    input: {
      origin: action.command,
      severity: action.tags.includes('critical') ? 'critical' : 'warning',
      signalIds: [action.id, action.region as unknown as string],
    } as TInput,
    output: output as TOutput,
    expectedDurationMinutes: Math.max(1, action.expectedDurationMinutes),
    dependencies: dependencyFromStep(action.id, index),
    requiredArtifacts: [makeArtifactId(`req:${action.id}`)],
    produces: [makeArtifactId(`out:${action.id}`)],
  };
};

const computeRisk = (plan: RecoveryPlan): number => {
  const risk = 100 - Math.max(0, Math.min(100, 20 + plan.actions.length * 2 - plan.slaMinutes));
  const riskByTags = plan.actions.reduce((acc, action) => {
    return action.tags.includes('critical') ? acc + 8 : acc + 1;
  }, 0);
  return Math.min(100, risk + Math.max(0, riskByTags - 5));
};

export const buildBlueprintFromPlan = (plan: RecoveryPlan, namespace: string, planActionOrder?: readonly RecoveryAction[]): RecoveryBlueprint => {
  const ordered = (planActionOrder?.length ? [...planActionOrder] : [...plan.actions]).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const steps = ordered.map((action, index) => stepFromAction(action, index, namespace));
  const status: BlueprintStatus = plan.isSafe ? 'ready' : 'draft';
  return {
    blueprintId: toBlueprintId(namespace, plan.planId, 'discovery'),
    planId: plan.planId,
    namespace: `namespace:${namespace}` as BlueprintNamespace,
    stages: [...new Set(ordered.map((_, index) => stageForIndex(index)))] as readonly BlueprintStage[],
    steps: steps as unknown as RecoveryBlueprint['steps'],
    tags: plan.labels.labels,
    status,
    createdAt: toTimestamp(new Date()),
    riskScore: riskToScore(computeRisk(plan)) as RiskScore,
  };
};

export const normalizeBlueprintSteps = (
  blueprint: RecoveryBlueprint,
  preferred = ['discovery', 'analysis', 'execution', 'verification', 'closure'] as const,
): RecoveryBlueprint => {
  const rank = new Map(preferred.map((name, index) => [name, index] as const));
  const nextSteps = [...blueprint.steps].sort((left, right) => {
    const leftPriority = rank.get(left.stage) ?? 99;
    const rightPriority = rank.get(right.stage) ?? 99;
    return leftPriority - rightPriority;
  });
  return {
    ...blueprint,
    steps: nextSteps,
    stages: Array.from(new Set(nextSteps.map((step) => step.stage))),
  };
};

export const buildBlueprintArtifacts = (
  blueprint: RecoveryBlueprint,
  actor: EntityRef<'operator'>,
): BlueprintArtifactTypes => {
  const createdAt = toTimestamp(new Date());
  return {
    signal: {
      artifactId: makeArtifactId(`sig:${blueprint.blueprintId}`),
      source: blueprint.steps[0]?.name ?? 'blueprint:unknown',
      createdAt,
      payload: {
        origin: actor.kind,
        severity: blueprint.riskScore > 70 ? 'critical' : blueprint.riskScore > 40 ? 'warning' : 'info',
        signalIds: blueprint.steps.flatMap((step) => [step.name, ...step.requiredArtifacts]),
      },
      score: blueprint.riskScore,
    },
    simulation: {
      artifactId: makeArtifactId(`sim:${blueprint.blueprintId}`),
      source: blueprint.steps[0]?.name ?? 'blueprint:unknown',
      createdAt,
      payload: {
        simulationRunId: `sim:${blueprint.blueprintId}`,
        confidence: Math.max(15, 100 - blueprint.steps.length * 2),
        predictedMinutes: blueprint.steps.reduce((acc, step) => acc + step.expectedDurationMinutes, 0),
        expectedArtifacts: blueprint.steps.flatMap((step) => step.produces),
      },
      score: blueprint.riskScore / 2,
    },
    control: {
      artifactId: makeArtifactId(`control:${blueprint.blueprintId}`),
      source: blueprint.steps[0]?.name ?? 'blueprint:unknown',
      createdAt,
      payload: {
        controlRunId: `control:${blueprint.blueprintId}`,
        controlsApplied: blueprint.steps.flatMap((step) => [step.name, ...step.dependencies]),
        rollbackPlan: blueprint.steps.map((step) => `rollback:${step.stepId}`),
      },
      score: 100 - blueprint.riskScore,
    },
    policy: {
      artifactId: makeArtifactId(`policy:${blueprint.blueprintId}`),
      source: blueprint.steps[0]?.name ?? 'blueprint:unknown',
      createdAt,
      payload: {
        policyRunId: `policy:${blueprint.blueprintId}`,
        evaluatedRules: blueprint.steps
          .map((step) => step.labels)
          .flat()
          .map((label) => ({ rule: `label:${label}`, result: label.length > 3 ? 'pass' : 'warn' })),
      },
      score: Math.max(0, 100 - blueprint.steps.length),
    },
    verification: {
      artifactId: makeArtifactId(`verify:${blueprint.blueprintId}`),
      source: blueprint.steps[0]?.name ?? 'blueprint:unknown',
      createdAt,
      payload: {
        verificationRunId: `verify:${blueprint.blueprintId}`,
        checks: [
          {
            key: 'completeness',
            status: blueprint.steps.length > 0 ? 'pass' : 'fail',
          },
          {
            key: 'uniqueness',
            status: new Set(blueprint.steps.map((step) => step.stepId)).size === blueprint.steps.length ? 'pass' : 'warn',
          },
        ],
      },
      score: Math.max(0, 100 - blueprint.steps.length),
    },
  } as BlueprintArtifactTypes;
};

const collectRegionSet = (steps: RecoveryBlueprint['steps']): ReadonlySet<Region> => {
  const regions = new Set<Region>();
  for (const step of steps) {
    const parts = step.name.split(':');
    const region = (parts.at(2) ?? undefined) as Region | undefined;
    if (region) {
      regions.add(region);
    }
  }
  return regions;
};

const collectServiceSet = (steps: RecoveryBlueprint['steps']): ReadonlySet<ServiceCode> => {
  const services = new Set<ServiceCode>();
  for (const step of steps) {
    const service = step.input.origin as ServiceCode;
    if (service) {
      services.add(service);
    }
  }
  return services;
};

export const summarizeBlueprint = (blueprint: RecoveryBlueprint): {
  readonly id: BlueprintId;
  readonly planId: PlanId;
  readonly status: BlueprintStatus;
  readonly risk: RiskScore;
  readonly digest: BlueprintDigest;
  readonly regions: ReadonlyArray<Region>;
  readonly services: ReadonlyArray<ServiceCode>;
} => {
  const regions = Array.from(collectRegionSet(blueprint.steps));
  const services = Array.from(collectServiceSet(blueprint.steps));
  const digest: BlueprintDigest = {
    fingerprint: `${blueprint.planId}:${blueprint.steps.length}:${blueprint.createdAt}`,
    stepCount: blueprint.steps.length,
    stageCount: blueprint.stages.length,
    firstStage: blueprint.stages[0] ?? 'discovery',
    lastStage: blueprint.stages[blueprint.stages.length - 1] ?? 'closure',
    risk: Number(blueprint.riskScore),
  };
  return {
    id: blueprint.blueprintId,
    planId: blueprint.planId,
    status: blueprint.status,
    risk: blueprint.riskScore,
    digest,
    regions,
    services,
  };
};

export const nextBlueprintRiskBand = (risk: RiskScore): 'low' | 'medium' | 'high' | 'critical' => {
  if (risk < 25) return 'low';
  if (risk < 50) return 'medium';
  if (risk < 75) return 'high';
  return 'critical';
};

export const withBlueprint = <T>(
  blueprint: RecoveryBlueprint,
  mutation: (draft: RecoveryBlueprint, steps: RecoveryBlueprint['steps']) => T,
): T => {
  const draft = normalizeBlueprintSteps(blueprint);
  return mutation(draft, draft.steps);
};

export const stableBlueprintId = (blueprint: RecoveryBlueprint, actor: EntityRef<'operator'>['id']): string =>
  `${actor}:${blueprint.blueprintId}:${blueprint.steps.length}` as const satisfies string;
