import { z } from 'zod';
import type { CommandLabRecord } from './lab-records';

export const labRecordStatusSchema = z.enum(['queued', 'running', 'stable', 'critical', 'slow']);
export const labArtifactSchema = z.object({
  key: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.number().finite().nonnegative(),
});

export const labRecordSchema = z
  .object({
    id: z.string().trim().min(1),
    tenantId: z.string().trim().min(1),
    command: z.object({
      id: z.string().trim().min(1),
      title: z.string().trim().min(1),
      description: z.string().trim().min(1),
      ownerTeam: z.string().trim().min(1),
      priority: z.enum(['critical', 'high', 'medium', 'low']),
      window: z.object({
        id: z.string().trim().min(1),
        startsAt: z.string().trim().min(1),
        endsAt: z.string().trim().min(1),
        preferredClass: z.string().trim().min(1),
        maxConcurrent: z.number().finite().positive(),
      }),
      affectedResources: z.array(z.string()),
      dependencies: z.array(z.string()),
      prerequisites: z.array(z.string()),
      constraints: z.array(
        z.object({
          id: z.string().trim().min(1),
          commandId: z.string().trim().min(1),
          reason: z.string().trim().min(1),
          hard: z.boolean(),
          tags: z.array(z.string()),
        }),
      ),
      expectedRunMinutes: z.number().finite().nonnegative(),
      riskWeight: z.number().finite().nonnegative(),
      runbook: z.array(z.string()),
      runMode: z.enum(['canary', 'full', 'shadow']),
      retryWindowMinutes: z.number().finite().nonnegative(),
    }),
    status: labRecordStatusSchema,
    planId: z.string().trim().min(1).optional(),
    lastRunStatus: z.enum(['planned', 'queued', 'running', 'blocked', 'completed', 'failed']).optional(),
    createdAt: z.string().trim().min(1),
    updatedAt: z.string().trim().min(1),
    riskScore: z.number().finite(),
    expectedRunMinutes: z.number().finite().nonnegative(),
    artifacts: z.array(labArtifactSchema),
  })
  .passthrough();

export const labRecordsByStatusSchema = z.array(labRecordSchema);

export const parseLabRecord = (record: unknown): CommandLabRecord =>
  labRecordSchema.parse(record) as unknown as CommandLabRecord;
export const parseLabRecords = (records: unknown): CommandLabRecord[] =>
  labRecordsByStatusSchema.parse(records) as unknown as CommandLabRecord[];
