import { z } from 'zod';
import type {
  IncidentContext,
  IncidentId,
  RecoveryScenario,
  ScenarioEnvelope,
  ScenarioId,
  ProgramId,
  TenantId,
} from '@domain/recovery-scenario-engine';

const IncidentContextSchema = z.object({
  incidentId: z.string(),
  scenarioId: z.string(),
  tenantId: z.string(),
  service: z.string(),
  region: z.string(),
  detectedAt: z.string().datetime(),
  signals: z.array(
    z.object({
      metric: z.string(),
      value: z.number(),
      unit: z.string(),
      dimension: z.record(z.string()),
      observedAt: z.string().datetime(),
    }),
  ),
  rawMetadata: z.record(z.unknown()),
});

const RecoveryScenarioSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  programId: z.string(),
  name: z.string(),
  description: z.string(),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
  state: z.string(),
  constraints: z.array(z.object({ key: z.string(), operator: z.string(), threshold: z.number(), windowMinutes: z.number() })),
  actions: z.array(
    z.object({
      code: z.string(),
      owner: z.string(),
      command: z.string(),
      requiredApprovals: z.number(),
      estimatedMinutes: z.number(),
      tags: z.array(z.string()),
    }),
  ),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ScenarioEnvelopeSchema = z.object({
  scenario: RecoveryScenarioSchema,
  context: IncidentContextSchema,
  decision: z.object({
    scenarioId: z.string(),
    incidentContext: IncidentContextSchema,
    confidence: z.number(),
    rationale: z.array(z.string()),
    actions: z.array(
      z.object({
        code: z.string(),
        owner: z.string(),
        command: z.string(),
        requiredApprovals: z.number(),
        estimatedMinutes: z.number(),
        tags: z.array(z.string()),
      }),
    ),
  }),
  metrics: z.object({
    windowStart: z.string(),
    windowEnd: z.string(),
    matchedSignals: z.number(),
    meanSignalValue: z.number(),
    maxSignalValue: z.number(),
    uniqueDimensions: z.number(),
  }),
  run: z.object({
    runId: z.string(),
    incidentId: z.string(),
    scenarioId: z.string(),
    actionCodes: z.array(z.string()),
    estimatedMinutes: z.number(),
    requiresManualApproval: z.boolean(),
  }),
});

export const encodeScenarioEnvelope = (envelope: ScenarioEnvelope): string =>
  JSON.stringify({
    scenario: envelope.scenario,
    context: envelope.context,
    decision: envelope.decision,
    metrics: envelope.metrics,
    run: envelope.run,
  });

export const decodeScenarioEnvelope = (payload: string): ScenarioEnvelope => {
  const parsed = ScenarioEnvelopeSchema.parse(JSON.parse(payload));
  const toTenantId = (value: string): TenantId => value as TenantId;
  const toScenarioId = (value: string): ScenarioId => value as ScenarioId;
  const toIncidentId = (value: string): IncidentId => value as IncidentId;

  return {
    scenario: {
      ...parsed.scenario,
      id: toScenarioId(parsed.scenario.id),
      tenantId: toTenantId(parsed.scenario.tenantId),
      programId: parsed.scenario.programId as ProgramId,
    } as RecoveryScenario,
    context: {
      ...parsed.context,
      incidentId: toIncidentId(parsed.context.incidentId),
      scenarioId: toScenarioId(parsed.context.scenarioId),
      tenantId: toTenantId(parsed.context.tenantId),
    } as IncidentContext,
    decision: {
      ...parsed.decision,
      scenarioId: toScenarioId(parsed.decision.scenarioId),
      incidentContext: {
        ...parsed.decision.incidentContext,
        incidentId: toIncidentId(parsed.decision.incidentContext.incidentId),
        scenarioId: toScenarioId(parsed.decision.incidentContext.scenarioId),
        tenantId: toTenantId(parsed.decision.incidentContext.tenantId),
      } as IncidentContext,
    },
    metrics: parsed.metrics,
    run: {
      ...parsed.run,
      runId: parsed.run.runId as string & { readonly __brand: 'RecoveryRunId' },
      incidentId: toIncidentId(parsed.run.incidentId),
      scenarioId: toScenarioId(parsed.run.scenarioId),
      actionCodes: parsed.run.actionCodes,
      estimatedMinutes: parsed.run.estimatedMinutes,
      requiresManualApproval: parsed.run.requiresManualApproval,
    },
  };
};
