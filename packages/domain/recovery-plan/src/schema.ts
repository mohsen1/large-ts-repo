import { z } from 'zod';

import type {
  RecoveryExecutionContext,
  RecoveryPlanCandidate,
  RecoveryExecutionPlan,
  RecoveryPlanMetadata,
  RecoveryRoute,
  RecoveryStageName,
  RecoveryStageObjective,
  RecoveryPlanSignal,
  RecoveryPlanTemplate,
  RecoveryConstraintWindow,
} from './types';

import { buildRoute } from './utils';

const RecoveryStageSchema = z.enum(['prepare', 'execute', 'validate', 'rollback']) as z.ZodType<RecoveryStageName>;
const StageObjectiveSchema: z.ZodType<RecoveryStageObjective> = z.object({
  key: z.string().min(1),
  weight: z.number().min(0).max(100),
  successCriteria: z.array(z.string().min(1)),
});

const RouteSchema = z.object({
  id: z.string().min(1),
  stepIds: z.array(z.string().min(1)),
  description: z.string().min(1),
  resilienceScore: z.number().min(0).max(100),
  expectedSeconds: z.number().nonnegative(),
  objectives: z.array(StageObjectiveSchema).min(1),
}).transform((route) => ({
  ...route,
  id: route.id as RecoveryRoute['id'],
}));

const SignalSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['policy', 'risk', 'ops']),
  value: z.number(),
  note: z.string().min(1),
}).transform((signal) => ({
  ...signal,
  id: signal.id as RecoveryPlanSignal['id'],
}));

const MetaSchema: z.ZodType<RecoveryPlanMetadata> = z.object({
  owner: z.string().min(1),
  correlationId: z.string().min(1),
  environment: z.string().min(1),
  runWindow: z.object({
    from: z.string(),
    to: z.string(),
    timezone: z.string().min(1),
  }) as z.ZodType<RecoveryConstraintWindow>,
  tags: z.record(z.string(), z.string()),
});

const CandidateSchema = z.object({
  id: z.string().min(1),
  route: RouteSchema,
  estimatedMinutes: z.number().positive(),
  confidence: z.number().min(0).max(100),
  blockingPolicyCount: z.number().min(0),
  policyEvaluations: z.array(z.unknown()),
  signals: z.array(SignalSchema),
  rationale: z.array(z.string()),
}).transform((candidate) => ({
  ...candidate,
  id: candidate.id as RecoveryPlanCandidate['id'],
  policyEvaluations: candidate.policyEvaluations as RecoveryPlanCandidate['policyEvaluations'],
}));

const ExecutionPlanSchema = z.object({
  planId: z.string().min(1),
  runId: z.string().min(1),
  version: z.string().regex(/^v\d+$/),
  candidates: z.array(CandidateSchema),
  selected: z.string().min(1),
  stagedSequence: z.array(RecoveryStageSchema),
  metadata: MetaSchema,
}).transform((plan) => ({
  ...plan,
  planId: plan.planId as RecoveryExecutionPlan['planId'],
  runId: plan.runId as RecoveryExecutionPlan['runId'],
  version: plan.version as RecoveryExecutionPlan['version'],
  candidates: plan.candidates as RecoveryExecutionPlan['candidates'],
  selected: plan.selected as RecoveryPlanCandidate['id'],
}));

const TemplateSchema = z.object({
  id: z.string().min(1),
  tenant: z.string().min(1),
  service: z.string().min(1),
  priority: z.enum(['bronze', 'silver', 'gold', 'platinum']),
  mode: z.enum(['preventive', 'defensive', 'restorative', 'emergency']),
  routes: z.array(RouteSchema).min(1),
  maxRetries: z.number().int().nonnegative(),
  window: z.object({
    startsAt: z.string(),
    endsAt: z.string(),
    timezone: z.string().min(1),
  }),
  policyReferences: z.array(z.string().min(1)),
}).transform((template) => ({
  ...template,
  id: template.id as RecoveryPlanTemplate['id'],
  tenant: template.tenant as RecoveryPlanTemplate['tenant'],
  service: template.service as RecoveryPlanTemplate['service'],
  routes: template.routes as RecoveryPlanTemplate['routes'],
  policyReferences: template.policyReferences as unknown as RecoveryPlanTemplate['policyReferences'],
}));

const RecoveryExecutionContextSchema = z.object({
  program: z.object({
    id: z.string().min(1),
    tenant: z.string().min(1),
    service: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    priority: z.enum(['bronze', 'silver', 'gold', 'platinum']),
    mode: z.enum(['preventive', 'defensive', 'restorative', 'emergency']),
    window: z.object({
      startsAt: z.string(),
      endsAt: z.string(),
      timezone: z.string().min(1),
    }),
    topology: z.object({
      rootServices: z.array(z.string().min(1)),
      fallbackServices: z.array(z.string().min(1)),
      immutableDependencies: z.array(z.tuple([z.string().min(1), z.string().min(1)]),
      ),
    }),
    constraints: z.array(
      z.object({
        name: z.string().min(1),
        operator: z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'ne']),
        threshold: z.number(),
        description: z.string().min(1),
      })
    ),
    steps: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        command: z.string().min(1),
        timeoutMs: z.number().positive(),
        dependencies: z.array(z.string().min(1)),
        requiredApprovals: z.number().nonnegative(),
        tags: z.array(z.string()),
      }),
    ),
    owner: z.string().min(1),
    tags: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  runState: z.object({
    runId: z.string().min(1),
    programId: z.string().min(1),
    incidentId: z.string().min(1),
    status: z.enum(['draft', 'staging', 'running', 'completed', 'aborted', 'failed']),
    estimatedRecoveryTimeMinutes: z.number().nonnegative(),
  }),
  requestedBy: z.string().min(1),
  correlationId: z.string().min(1),
  candidateBudget: z.number().int().min(1).max(9),
}).transform((context) => ({
  ...context,
  program: {
    ...context.program,
    id: context.program.id as unknown as RecoveryExecutionContext['program']['id'],
    tenant: context.program.tenant as unknown as RecoveryExecutionContext['program']['tenant'],
    service: context.program.service as unknown as RecoveryExecutionContext['program']['service'],
    steps: context.program.steps,
  },
  runState: {
    ...context.runState,
    runId: context.runState.runId as unknown as RecoveryExecutionContext['runState']['runId'],
    programId: context.runState.programId as unknown as RecoveryExecutionContext['runState']['programId'],
    incidentId: context.runState.incidentId as unknown as RecoveryExecutionContext['runState']['incidentId'],
  },
}));

export const parseRecoveryPlanExecutionContext = (value: unknown): RecoveryExecutionContext => RecoveryExecutionContextSchema.parse(value) as RecoveryExecutionContext;
export const parseRecoveryExecutionPlan = (value: unknown): RecoveryExecutionPlan => ExecutionPlanSchema.parse(value) as RecoveryExecutionPlan;
export const parseRecoveryPlanCandidate = (value: unknown): RecoveryPlanCandidate => CandidateSchema.parse(value) as RecoveryPlanCandidate;
export const parseRecoveryPlanTemplate = (value: unknown): RecoveryPlanTemplate => TemplateSchema.parse(value) as RecoveryPlanTemplate;

export const demoRouteFromTemplate = (template: RecoveryPlanTemplate): RecoveryRoute => (
  buildRoute(
    `${template.id}:route`,
    template.routes[0]?.stepIds ?? [],
    template.mode === 'emergency'
      ? 'priority execution route'
      : 'baseline route',
    template.routes[0]?.expectedSeconds ?? 0,
    [],
  )
);
