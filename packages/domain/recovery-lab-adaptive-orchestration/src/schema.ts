import { z } from 'zod';
import {
  type TenantId,
  type CampaignId,
  type PlanId,
  type RunId,
  type CheckpointId,
  type CampaignRunMode,
  type AutomationStage,
  type CampaignPlan,
  type CampaignRunResult,
  type CampaignDiagnostic,
  type CampaignEnvelope,
  type CampaignSnapshot,
  type CampaignSignal,
  type CampaignConstraint,
  asTenantId,
  asCampaignId,
  asPlanId,
  asRunId,
  asCheckpointId,
  asPluginExecutionId,
  asDiagnosticsPluginId,
  asCampaignDependency,
  asScenarioIntent,
  asCampaignStepId,
} from './types';

export const automationModeEnum = z.enum(['simulate', 'validate', 'execute', 'dry-run', 'shadow']);
export const automationStageEnum = z.enum(['ingest', 'plan', 'execute', 'verify', 'synthesize']);

export const campaignIdentifierSchema = z.string().trim().min(3).max(128);
export const tenantIdentifierSchema = z.string().trim().min(2).max(96);
export const checkpointSchema = z.string().trim().min(10).max(96);

export const campaignConstraintSchema = z.object({
  key: z.string().trim().min(1),
  operator: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains']),
  threshold: z.number(),
  severity: z.number().min(0).max(100),
});

export const campaignSignalSchema = z.object({
  name: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  source: z.string().trim().min(1),
  value: z.number(),
  at: z.string().datetime(),
  dimensions: z.record(z.string()),
});

export const campaignStepSchema = <TPayload>(payloadSchema: z.ZodType<TPayload>) =>
  z.object({
    stepId: z.string().transform((value: string) => asCampaignStepId(value)),
    intent: z.string().trim().min(1).transform((value) => asScenarioIntent(value)),
    action: z.string().trim().min(1),
    expectedDurationMinutes: z.number().min(0),
    constraints: z.array(campaignConstraintSchema),
    dependencies: z.array(z.string().transform((value: string) => asCampaignDependency(value))),
    payload: payloadSchema,
    tags: z.array(z.string()),
  });

export const campaignPlanSchema = <TPayload>(payloadSchema: z.ZodType<TPayload>) =>
  z.object({
    tenantId: z.string().transform((value: string) => asTenantId(value)),
    campaignId: z.string().transform((value: string) => asCampaignId(value)),
    planId: z.string().transform((value: string) => asPlanId(value)),
    title: z.string().trim().min(1),
    createdBy: z.string().trim().min(1),
    mode: automationModeEnum,
    steps: z.array(campaignStepSchema(payloadSchema)),
    riskProfile: z.number().min(0).max(100),
    signalPolicy: z.array(z.string()),
  });

export const campaignDiagnosticSchema = z.object({
  id: z.string().transform((value: string) => asPluginExecutionId(value)),
  phase: automationStageEnum,
  pluginId: z.string().transform((value: string) => asDiagnosticsPluginId(value)),
  at: z.string().datetime(),
  source: z.string().min(1),
  message: z.string().min(1),
  tags: z.array(z.string()),
});

export const campaignRunResultSchema = <TPayload>(payloadSchema: z.ZodType<TPayload>) =>
  z.object({
    runId: z.string().transform((value: string) => asRunId(value)),
    campaignId: z.string().transform((value: string) => asCampaignId(value)),
    stage: automationStageEnum,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
    ok: z.boolean(),
    output: payloadSchema,
    diagnostics: z.array(campaignDiagnosticSchema),
  });

export const campaignEnvelopeSchema = <TPayload>(payloadSchema: z.ZodType<TPayload>) =>
  z.object({
    runId: z.string().transform((value: string) => asRunId(value)),
    campaignId: z.string().transform((value: string) => asCampaignId(value)),
    planId: z.string().transform((value: string) => asPlanId(value)),
    tenantId: z.string().transform((value: string) => asTenantId(value)),
    mode: automationModeEnum,
    context: z.record(z.unknown()),
    payload: payloadSchema,
  });

export const campaignSnapshotSchema = <TPayload>(payloadSchema: z.ZodType<TPayload>) =>
  z.object({
    key: z.string().transform((value: string) => asCheckpointId(value)),
    at: z.string().datetime(),
    tenantId: z.string().transform((value: string) => asTenantId(value)),
    campaignId: z.string().transform((value: string) => asCampaignId(value)),
    planId: z.string().transform((value: string) => asPlanId(value)),
    stage: z.string(),
    payload: payloadSchema,
  });

export const campaignManifestSchema = z.object({
  tenantId: tenantIdentifierSchema.transform((value: string) => asTenantId(value)),
  campaignId: campaignIdentifierSchema.transform((value: string) => asCampaignId(value)),
  planId: campaignIdentifierSchema.transform((value: string) => asPlanId(value)),
  runMode: automationModeEnum,
  stages: z.array(automationStageEnum),
  activeSteps: z.record(z.number()),
  labels: z.array(z.string()),
  tags: z.record(z.string()),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
});

export type CampaignPlanFromJson<TPayload = unknown> = CampaignPlan<TPayload>;
export type CampaignConstraintRecord = CampaignConstraint;
export type CampaignSignalRecord = CampaignSignal<number>;
export type CampaignDiagnosticRecord = CampaignDiagnostic;
export type CampaignManifestRecord = z.infer<typeof campaignManifestSchema>;
export type CampaignPlanSchemaRecord = CampaignPlan<unknown>;
export type CampaignRunResultSchema = CampaignRunResult<unknown>;
export type CampaignEnvelopeSchema<T = unknown> = CampaignEnvelope<T>;
export type CampaignSnapshotSchema<T = unknown> = CampaignSnapshot<T>;

export const parseCampaignManifest = (value: unknown): CampaignManifestRecord => campaignManifestSchema.parse(value);
export const parseCampaignPlan = <TPayload>(
  value: unknown,
  payloadSchema: z.ZodType<TPayload>,
): CampaignPlan<TPayload> => campaignPlanSchema(payloadSchema).parse(value) as CampaignPlan<TPayload>;

export const parseCampaignRunResult = <TPayload>(
  value: unknown,
  payloadSchema: z.ZodType<TPayload>,
): CampaignRunResult<TPayload> => campaignRunResultSchema(payloadSchema).parse(value) as CampaignRunResult<TPayload>;

export const parseCampaignDiagnostic = (value: unknown): CampaignDiagnostic => campaignDiagnosticSchema.parse(value);

export const parseCampaignEnvelope = <TPayload>(
  value: unknown,
  payloadSchema: z.ZodType<TPayload>,
): CampaignEnvelope<TPayload> => campaignEnvelopeSchema(payloadSchema).parse(value) as CampaignEnvelope<TPayload>;

export const parseCampaignSnapshot = <TPayload>(
  value: unknown,
  payloadSchema: z.ZodType<TPayload>,
): CampaignSnapshot<TPayload> => campaignSnapshotSchema(payloadSchema).parse(value) as CampaignSnapshot<TPayload>;

export const parseCampaignSignal = (input: readonly unknown[]): CampaignSignal<number>[] =>
  input.map((value) => campaignSignalSchema.parse(value) as CampaignSignal<number>);

export const parseCampaignConstraints = (constraints: readonly unknown[]): CampaignConstraint[] =>
  constraints.map((value) => campaignConstraintSchema.parse(value));

export const normalizeRunMode = (mode: CampaignRunMode): CampaignRunMode =>
  (mode === 'dry-run' ? 'validate' : mode) as CampaignRunMode;

export const manifestStageByMode = (mode: CampaignRunMode): AutomationStage => {
  if (mode === 'dry-run' || mode === 'validate') {
    return 'verify';
  }
  if (mode === 'simulate') {
    return 'plan';
  }
  return 'execute';
};

export const mapCampaignSteps = <TPayload>(
  steps: readonly CampaignPlan<TPayload>['steps'][number][],
): Record<string, CampaignPlan<TPayload>['steps'][number]> => Object.fromEntries(steps.map((step) => [String(step.stepId), step]));
