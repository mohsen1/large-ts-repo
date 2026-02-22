import { z } from 'zod';
import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';

export const commandArtifactSeveritySchema = z.enum(['critical', 'high', 'normal', 'low']);

export type CommandArtifactSeverity = z.infer<typeof commandArtifactSeveritySchema>;

export const commandArtifactCategorySchema = z.enum([
  'readiness',
  'containment',
  'migration',
  'comms',
  'compliance',
  'postmortem',
]);

export type CommandArtifactCategory = z.infer<typeof commandArtifactCategorySchema>;

export const commandArtifactShapeSchema = z.object({
  commandId: z.string().min(3),
  tenant: z.string().min(2),
  owner: z.string().min(2),
  title: z.string().min(3),
  description: z.string().min(10),
  category: commandArtifactCategorySchema,
  severity: commandArtifactSeveritySchema,
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  dueAt: z.string().datetime({ offset: true }).optional(),
  ownerContacts: z.array(z.object({
    name: z.string(),
    role: z.string(),
    email: z.string().email(),
  })),
  preconditions: z.array(z.string()),
  dependencies: z.array(z.string()),
  executionHints: z.array(z.object({
    command: z.string(),
    rationale: z.string(),
    estimatedSeconds: z.number().nonnegative().finite(),
  })),
});

export type CommandArtifactShape = z.infer<typeof commandArtifactShapeSchema>;

export interface CommandArtifact {
  readonly id: Brand<string, 'CommandArtifactId'>;
  readonly payload: CommandArtifactShape;
  readonly checksum: Brand<string, 'CommandArtifactChecksum'>;
  readonly version: number;
}

export const commandArtifactPatchSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  severity: commandArtifactSeveritySchema.optional(),
  tags: z.array(z.string()).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type CommandArtifactPatch = z.infer<typeof commandArtifactPatchSchema>;

export interface CommandRoutingIntent {
  readonly intentId: Brand<string, 'CommandRoutingIntentId'>;
  readonly commandId: Brand<string, 'CommandArtifactId'>;
  readonly fromRegion: Brand<string, 'RegionCode'>;
  readonly toRegion?: Brand<string, 'RegionCode'>;
  readonly constraints: {
    readonly mandatory: readonly Brand<string, 'ConstraintName'>[];
    readonly optional: readonly Brand<string, 'ConstraintName'>[];
    readonly maxWaitMs: number;
  };
  readonly startedAt: string;
  readonly expectedFinishAt: string;
}

export interface CommandArtifactEnvelope<T extends CommandArtifactShape = CommandArtifactShape> {
  readonly key: Brand<string, 'CommandArtifactKey'>;
  readonly artifact: T;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly metadata: {
    readonly source: 'planner' | 'operator' | 'automation';
    readonly sourceId: string;
    readonly generatedBy: string;
    readonly generatedAt: string;
  };
}

export interface CommandArtifactQuery {
  readonly tenant?: string;
  readonly categories?: readonly CommandArtifactCategory[];
  readonly severities?: readonly CommandArtifactSeverity[];
  readonly owners?: readonly string[];
  readonly search?: string;
  readonly changedAfter?: string;
  readonly changedBefore?: string;
}

export interface CommandArtifactTimelineItem {
  readonly artifactId: Brand<string, 'CommandArtifactId'>;
  readonly timestamp: string;
  readonly action: 'created' | 'updated' | 'routed' | 'executed' | 'failed';
  readonly actor: string;
  readonly details: string;
}

export interface CommandArtifactAuditTrail {
  readonly artifactId: Brand<string, 'CommandArtifactId'>;
  readonly events: readonly CommandArtifactTimelineItem[];
}

export const normalizeCommandArtifactCode = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export const buildCommandArtifactChecksum = (shape: CommandArtifactShape): string =>
  Buffer.from(
    JSON.stringify({
      commandId: shape.commandId,
      tenant: shape.tenant,
      title: shape.title,
      severity: shape.severity,
      dependencies: shape.dependencies,
      tags: shape.tags,
    }),
  ).toString('base64url');

export const toCommandArtifact = (shape: CommandArtifactShape): CommandArtifact => {
  const raw = commandArtifactShapeSchema.parse(shape);
  return {
    id: withBrand(raw.commandId, 'CommandArtifactId'),
    payload: raw,
    checksum: withBrand(buildCommandArtifactChecksum(raw), 'CommandArtifactChecksum'),
    version: 1,
  };
};

export const mapArtifactPatchToSeverity = (patch: CommandArtifactPatch): CommandArtifactSeverity | undefined => {
  return patch.severity;
};

export const prioritizeArtifactBySeverity = (a: CommandArtifact, b: CommandArtifact): number => {
  const score = (severity: CommandArtifactSeverity): number => {
    switch (severity) {
      case 'critical':
        return 100;
      case 'high':
        return 75;
      case 'normal':
        return 50;
      case 'low':
        return 25;
      default:
        return 0;
    }
  };

  return score(b.payload.severity) - score(a.payload.severity) || a.payload.updatedAt.localeCompare(b.payload.updatedAt);
};

export const parseArtifactCategory = (value: unknown): CommandArtifactCategory => {
  return commandArtifactCategorySchema.parse(value);
};

export const isCriticalArtifact = (artifact: CommandArtifact): boolean => artifact.payload.severity === 'critical';

export const makeRoutingWindow = (
  fromRegion: Brand<string, 'RegionCode'>,
  tenant: Brand<string, 'TenantId'>,
): CommandRoutingIntent => ({
  intentId: withBrand(`${tenant}:${fromRegion}:default`, 'CommandRoutingIntentId'),
  commandId: withBrand(`${tenant}:routing`, 'CommandArtifactId'),
  fromRegion,
  constraints: {
    mandatory: [withBrand('ops-approved', 'ConstraintName')],
    optional: [withBrand('cost-threshold', 'ConstraintName')],
    maxWaitMs: 60_000,
  },
  startedAt: new Date().toISOString(),
  expectedFinishAt: new Date(Date.now() + 15 * 60_000).toISOString(),
});
