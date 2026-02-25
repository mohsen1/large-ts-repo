import { z } from 'zod';
import {
  StageKind,
  StageStatus,
} from './topology';
import { PolicySurface, PolicyVerb } from './policies';

export const scenarioMetricSchema = z.object({
  metric: z.string(),
  value: z.number().finite(),
  at: z.number().int().positive(),
});

export const scenarioStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  status: z.enum(['queued', 'warming', 'active', 'paused', 'completed', 'failed']),
  dependsOn: z.array(z.string()),
});

export const topologySchema = z.object({
  scenarioId: z.string(),
  stageCount: z.number().int().nonnegative(),
  stages: z.array(scenarioStageSchema),
  transitions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      weight: z.number().nonnegative(),
      condition: z.string().optional(),
    }),
  ),
});

export const policyRuleSchema = z.object({
  code: z.string(),
  scope: z.enum(['global', 'scenario', 'stage']),
  surface: z.enum(['safety', 'cost', 'latency', 'resilience', 'compliance']),
  verb: z.enum(['allow', 'warn', 'block', 'require']),
  labels: z.array(z.string()),
  severity: z.number().min(0).max(5),
  active: z.boolean(),
});

export const scenarioPolicyManifestSchema = z.object({
  policySet: z.string(),
  generatedAt: z.number(),
  scenario: z.string(),
  rules: z.array(policyRuleSchema),
});

export const blueprintConfigSchema = z.object({
  id: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  region: z.string().min(2).max(8).default('us-east-1'),
  maxConcurrency: z.number().int().positive().default(8),
  retentionDays: z.number().int().nonnegative().default(14),
});

export const telemetrySchema = z.object({
  eventsPerSecond: z.number().nonnegative(),
  tags: z.record(z.string(), z.string()),
  checkpoints: z.array(z.string()),
});

export type ScenarioMetric = z.infer<typeof scenarioMetricSchema>;
export type ScenarioStage = z.infer<typeof scenarioStageSchema>;
export type ScenarioTopologySchema = z.infer<typeof topologySchema>;
export type ScenarioPolicyRule = z.infer<typeof policyRuleSchema>;
export type ScenarioPolicyManifest = z.infer<typeof scenarioPolicyManifestSchema>;
export type BlueprintConfig = z.infer<typeof blueprintConfigSchema>;
export type ScenarioTelemetry = z.infer<typeof telemetrySchema>;

export const schemaVersions = {
  metrics: scenarioMetricSchema,
  stages: scenarioStageSchema,
  topology: topologySchema,
  policy: scenarioPolicyManifestSchema,
  blueprint: blueprintConfigSchema,
  telemetry: telemetrySchema,
} as const;

export function assertValidKind(kind: string): kind is StageKind {
  return (['ingress', 'enrichment', 'forecast', 'mitigation', 'verification', 'rollback', 'audit'] as const).includes(kind as StageKind);
}

export function assertValidStatus(status: string): status is StageStatus {
  return (['queued', 'warming', 'active', 'paused', 'completed', 'failed'] as const).includes(status as StageStatus);
}

export function assertPolicyVerb(verb: string): verb is PolicyVerb {
  return ['allow', 'warn', 'block', 'require'].includes(verb as PolicyVerb);
}

export function assertPolicySurface(surface: string): surface is PolicySurface {
  return ['safety', 'cost', 'latency', 'resilience', 'compliance'].includes(surface as PolicySurface);
}

export const schemaSet = {
  supported: ['1.0.0', '1.1.0', '2.0.0'] as const,
  default: '2.0.0',
} as const;

export const isKnownSchemaVersion = (version: string): version is typeof schemaSet.supported[number] => {
  return schemaSet.supported.includes(version as any);
};
