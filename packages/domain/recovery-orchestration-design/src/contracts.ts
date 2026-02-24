import { z } from 'zod';
import { withBrand } from '@shared/core';
import type { Brand, NoInfer, PathTuple, RecursivePath, Result } from '@shared/type-level';

export type DesignTenantId = Brand<string, 'DesignTenantId'>;
export type DesignWorkspaceId = Brand<string, 'DesignWorkspaceId'>;
export type DesignScenarioId = Brand<string, 'DesignScenarioId'>;
export type DesignPlanId = Brand<string, 'DesignPlanId'>;
export type DesignExecutionId = Brand<string, 'DesignExecutionId'>;
export type DesignNodeId = Brand<string, 'DesignNodeId'>;
export type DesignSignalId = Brand<string, 'DesignSignalId'>;

export type DesignStage = 'intake' | 'design' | 'validate' | 'execute' | 'safety-check' | 'review';
export type DesignSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DesignSignalKind = 'health' | 'capacity' | 'compliance' | 'cost' | 'risk';
export type DesignRunState = 'created' | 'queued' | 'running' | 'paused' | 'complete' | 'aborted' | 'failed';

export type DesignEventScope<TScope extends string = string> = `design/${TScope}`;
export type WorkspaceTag = `tag:${string}`;
export type DesignSignalPath = `signal/${DesignSignalKind}/${DesignStage}`;
export type DesignErrorCode = `design/${'validation' | 'runtime' | 'registry' | 'policy' | 'transport' | 'diagnostics'}`;
export type NodeKind = 'intent' | 'step' | 'action' | 'check' | 'result';

export type RecursiveLabels<T extends string, N extends number = 8, Prefix extends T[] = []> = Prefix['length'] extends N
  ? Prefix
  : [...Prefix, T] | RecursiveLabels<T, N, [...Prefix, T]>;

export interface DesignMetrics {
  readonly health: number;
  readonly capacity: number;
  readonly compliance: number;
  readonly cost: number;
  readonly risk: number;
}

export interface DesignNode {
  readonly id: DesignNodeId;
  readonly name: string;
  readonly stage: DesignStage;
  readonly kind: NodeKind;
  readonly severity: DesignSeverity;
  readonly signal: DesignSignalKind;
  readonly tags: readonly WorkspaceTag[];
  readonly metrics: DesignMetrics;
  readonly dependencies: readonly string[];
}

export interface DesignPlanTemplate<
  TTags extends readonly WorkspaceTag[] = readonly WorkspaceTag[],
  TPhases extends readonly DesignStage[] = readonly DesignStage[],
> {
  readonly templateId: string;
  readonly tenantId: DesignTenantId;
  readonly workspaceId: DesignWorkspaceId;
  readonly scenarioId: DesignScenarioId;
  readonly phases: TPhases;
  readonly tags: TTags;
  readonly tagsCsv: string;
  readonly nodes: readonly DesignNode[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface DesignPlan {
  readonly planId: DesignPlanId;
  readonly tenantId: DesignTenantId;
  readonly workspaceId: DesignWorkspaceId;
  readonly scenarioId: DesignScenarioId;
  readonly stage: DesignStage;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly state: DesignRunState;
  readonly steps: readonly string[];
  readonly tags: readonly WorkspaceTag[];
  readonly confidence: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PlanSignal {
  readonly id: string;
  readonly runId: DesignPlanId;
  readonly metric: DesignSignalKind;
  readonly stage: DesignStage;
  readonly path: DesignSignalPath;
  readonly value: number;
  readonly timestamp: string;
}

export interface DesignDiagnostic<TScope extends DesignEventScope = DesignEventScope> {
  readonly scope: TScope;
  readonly kind: DesignErrorCode;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export type StageRemap<TRecord extends Record<string, unknown>> = {
  [K in keyof TRecord as `design:${Extract<K, string>}`]: TRecord[K];
};

export type SignalBucket<T extends readonly PlanSignal[]> = {
  [Signal in T[number] as `bucket:${Signal['metric']}`]: readonly Signal[];
};

export type StageTuple<T extends readonly DesignStage[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head & DesignStage, ...StageTuple<Tail & readonly DesignStage[]>]
  : readonly [];

export type TemplateByPhases<TTemplates extends readonly DesignPlanTemplate[]> = {
  readonly [TTemplate in TTemplates[number] as TTemplate['templateId']]: {
    readonly tenantId: TTemplate['tenantId'];
    readonly phaseCount: TTemplate['phases']['length'];
  };
};

export const designStageWeights: Record<DesignStage, number> = {
  intake: 3,
  design: 2,
  validate: 2,
  execute: 1,
  'safety-check': 1,
  review: 0,
};

const stageSchema = z
  .union([
    z.literal('intake'),
    z.literal('design'),
    z.literal('validate'),
    z.literal('execute'),
    z.literal('safety-check'),
    z.literal('review'),
  ])
  .transform((value): DesignStage => value);

const severitySchema = z
  .union([z.literal('low'), z.literal('medium'), z.literal('high'), z.literal('critical')])
  .transform((value): DesignSeverity => value);

const signalSchema = z
  .union([z.literal('health'), z.literal('capacity'), z.literal('compliance'), z.literal('cost'), z.literal('risk')])
  .transform((value): DesignSignalKind => value);

const designMetricsSchema = z.object({
  health: z.number().min(0).max(1).default(0),
  capacity: z.number().min(0).max(1).default(0),
  compliance: z.number().min(0).max(1).default(0),
  cost: z.number().min(0).max(1).default(0),
  risk: z.number().min(0).max(1).default(0),
});

const nodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  stage: stageSchema,
  kind: z.union([z.literal('intent'), z.literal('step'), z.literal('action'), z.literal('check'), z.literal('result')]),
  severity: severitySchema,
  signal: signalSchema,
  tags: z.array(z.string().min(1)).default([]),
  metrics: designMetricsSchema,
  dependencies: z.array(z.string().min(1)).default([]),
});

const templateSchema = z
  .object({
    templateId: z.string().min(1),
    tenantId: z.string().min(1),
    workspaceId: z.string().min(1),
    scenarioId: z.string().min(1),
    phases: z.array(stageSchema).default([]),
    tags: z.array(z.string().min(1)).default([]),
    tagsCsv: z.string().default(''),
    nodes: z.array(nodeSchema).default([]),
    metadata: z.record(z.unknown()),
  })
  .transform((template) => ({
    ...template,
    tenantId: withBrand(template.tenantId, 'DesignTenantId'),
    workspaceId: withBrand(template.workspaceId, 'DesignWorkspaceId'),
    scenarioId: withBrand(template.scenarioId, 'DesignScenarioId'),
    nodes: template.nodes.map((node) => ({ ...node, id: withBrand(node.id, 'DesignNodeId') })),
  })) as unknown as z.ZodType<DesignPlanTemplate>;

const planSchema = z
  .object({
    planId: z.string().min(1),
    tenantId: z.string().min(1),
    workspaceId: z.string().min(1),
    scenarioId: z.string().min(1),
    stage: stageSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    state: z.union([
      z.literal('created'),
      z.literal('queued'),
      z.literal('running'),
      z.literal('paused'),
      z.literal('complete'),
      z.literal('aborted'),
      z.literal('failed'),
    ]),
    steps: z.array(z.string().min(1)),
    tags: z.array(z.string().min(1)),
    confidence: z.number().min(0).max(1),
    metadata: z.record(z.unknown()),
  })
  .transform((plan) => ({
    ...plan,
    planId: withBrand(`${plan.planId}:${plan.createdAt}`, 'DesignPlanId'),
    tenantId: withBrand(plan.tenantId, 'DesignTenantId'),
    workspaceId: withBrand(plan.workspaceId, 'DesignWorkspaceId'),
    scenarioId: withBrand(plan.scenarioId, 'DesignScenarioId'),
  })) as unknown as z.ZodType<DesignPlan>;

const signalInputSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  metric: signalSchema,
  stage: stageSchema,
  path: z.string().min(1),
  value: z.number(),
  timestamp: z.string().datetime(),
})
  .transform((raw) => ({
    ...raw,
    runId: withBrand(raw.runId, 'DesignPlanId'),
    path: `signal/${raw.metric}/${raw.stage}` as DesignSignalPath,
  }));

const seedTemplates = [
  {
    templateId: 'recovery-baseline',
    tenantId: 'tenant-alpha',
    workspaceId: 'ws-primary',
    scenarioId: 'resilience-stress',
    phases: ['intake', 'design', 'validate', 'execute', 'safety-check', 'review'],
    tags: ['tag:baseline', 'tag:automated'],
    tagsCsv: 'baseline,automated',
    nodes: [],
    metadata: { source: 'seed', confidence: 0.92 },
  },
  {
    templateId: 'capacity-cascade',
    tenantId: 'tenant-alpha',
    workspaceId: 'ws-primary',
    scenarioId: 'capacity-wave',
    phases: ['intake', 'design', 'validate', 'execute'],
    tags: ['tag:capacity', 'tag:priority'],
    tagsCsv: 'capacity,priority',
    nodes: [],
    metadata: { source: 'seed', confidence: 0.84 },
  },
  {
    templateId: 'compliance-safe',
    tenantId: 'tenant-beta',
    workspaceId: 'ws-containment',
    scenarioId: 'compliance-event',
    phases: ['intake', 'design', 'validate', 'review'],
    tags: ['tag:compliance'],
    tagsCsv: 'compliance',
    nodes: [],
    metadata: { source: 'seed', confidence: 0.8 },
  },
];

const resolveTemplates = (): readonly DesignPlanTemplate[] =>
  [...seedTemplates].map((seed) => templateSchema.parse(seed)).toSorted((left, right) => left.templateId.localeCompare(right.templateId));

export const builtinTemplates = resolveTemplates();

export const makeDesignTenantId = (raw: string): DesignTenantId => withBrand(raw, 'DesignTenantId');
export const makeDesignWorkspaceId = (raw: string): DesignWorkspaceId => withBrand(raw, 'DesignWorkspaceId');
export const makeDesignScenarioId = (tenant: string, value: string): DesignScenarioId =>
  withBrand(`${tenant}:${value}`, 'DesignScenarioId');
export const makeDesignPlanId = (tenant: string, workspace: string, scenario: string): DesignPlanId =>
  withBrand(`${tenant}:${workspace}:${scenario}`, 'DesignPlanId');
export const makeDesignExecutionId = (plan: DesignPlanId, index: number): DesignExecutionId =>
  withBrand(`${plan}:${index}`, 'DesignExecutionId');
export const makeDesignSignalId = (runId: DesignPlanId, metric: DesignSignalKind, at: number): DesignSignalId =>
  withBrand(`${runId}:${metric}:${at}`, 'DesignSignalId');

export const parseTemplate = (raw: unknown): DesignPlanTemplate => templateSchema.parse(raw);
export const parsePlanTemplate = (raw: unknown): DesignPlanTemplate => parseTemplate(raw);
export const parsePlan = (raw: unknown): DesignPlan => planSchema.parse(raw);
export const parseSignal = (raw: unknown): PlanSignal => signalInputSchema.parse(raw);

export const buildTemplateKey = (tenant: DesignTenantId, template: string): string => `${tenant}:${template}`;
export const buildPlanWindow = <TPlans extends readonly DesignPlanTemplate[]>(plans: NoInfer<TPlans>): readonly string[] =>
  plans.toSorted((left, right) => left.templateId.localeCompare(right.templateId)).map((template) => buildTemplateKey(template.tenantId, template.templateId));

export const nodeCountByStage = <TNodes extends readonly DesignNode[]>(nodes: NoInfer<TNodes>): Record<DesignStage, number> =>
  nodes.reduce<Record<DesignStage, number>>(
    (acc, node) => ({
      ...acc,
      [node.stage]: (acc[node.stage] ?? 0) + 1,
    }),
    { intake: 0, design: 0, validate: 0, execute: 0, 'safety-check': 0, review: 0 },
  );

export const stagePath = <T extends string>(path: T): PathTuple<RecursivePath<Record<'path', T>>> =>
  path.split('/') as unknown as PathTuple<RecursivePath<Record<'path', T>>>;

export const runDiagnostics = <TPlan extends readonly DesignPlanTemplate[]>(
  plans: NoInfer<TPlan>,
): Result<TPlan, DesignDiagnostic> => {
  const invalid = plans.filter((plan) => plan.nodes.some((node) => node.metrics.health < 0 || node.metrics.risk < 0));
  return invalid.length > 0
    ? {
        ok: false,
        error: {
          scope: 'design/diagnostics',
          kind: 'design/diagnostics',
          message: 'plan node health/risk must be between 0 and 1',
          details: { invalidCount: invalid.length },
        },
      }
    : { ok: true, value: plans };
};

export const stageCoverage = <TPlan extends DesignPlanTemplate>(plan: TPlan): TPlan['phases'] => plan.phases;

export const routeSignature = <TTuple extends readonly string[]>(parts: TTuple): readonly string[] =>
  parts;

export const normalizeStages = <TStages extends readonly string[]>(
  stages: TStages,
  fallback: string,
): readonly DesignStage[] => {
  const normalized = new Map<string, number>();
  return stages
    .map((stage, index) => `${stage}:${index}`)
    .filter((entry): entry is `${string}:${number}` => entry.includes(':'))
    .map((entry) => {
      const [name] = entry.split(':') as [DesignStage, string];
      normalized.set(name, (normalized.get(name) ?? 0) + 1);
      return name;
    })
    .concat(
      normalized.has(fallback)
        ? []
        : [fallback as DesignStage],
    )
    .filter((entry): entry is DesignStage => (['intake', 'design', 'validate', 'execute', 'safety-check', 'review'] as const).includes(entry));
};
