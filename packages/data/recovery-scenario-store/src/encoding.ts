import { z } from 'zod';
import type { IncidentContext, RecoveryScenario, ScenarioEnvelope } from '@domain/recovery-scenario-engine';

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
  return {
    scenario: parsed.scenario as RecoveryScenario,
    context: parsed.context as IncidentContext,
    decision: {
      ...parsed.decision,
      incidentContext: parsed.decision.incidentContext as IncidentContext,
    },
    metrics: parsed.metrics,
    run: {
      ...parsed.run,
      runId: parsed.run.runId,
      actionCodes: parsed.run.actionCodes,
      estimatedMinutes: parsed.run.estimatedMinutes,
      requiresManualApproval: parsed.run.requiresManualApproval,
    },
  };
};
