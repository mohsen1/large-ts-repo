import { z } from 'zod';
import type { CommandGraph, CommandSynthesisRecord, CommandSynthesisResult } from '@domain/recovery-command-orchestration';
import { parseCommandGraph } from '@domain/recovery-command-orchestration';

export type CommandGraphStoreId = `${string}:store`;
export type CommandGraphRecordId = `${string}:record`;

export interface CommandGraphEnvelope {
  readonly id: CommandGraphStoreId;
  readonly graph: CommandGraph;
  readonly createdAt: string;
}

export interface CommandGraphTimeline {
  readonly graphId: string;
  readonly events: readonly CommandSynthesisRecord[];
  readonly sequence: readonly number[];
  readonly sampleRateMs: number;
}

export interface CommandGraphQuery {
  readonly tenant?: string;
  readonly runId?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface CommandGraphWriteOptions {
  readonly overwrite: boolean;
  readonly replaceExisting?: boolean;
}

export interface CommandGraphStoreSnapshot {
  readonly graphId: string;
  readonly tenant: string;
  readonly runId: string;
  readonly snapshotAt: string;
}

const commandGraphStoreIdSchema = z.string().regex(/.+:store$/);
const commandSynthesisRecordId = z.string().regex(/.+:record$/);

export const commandGraphEnvelopeSchema = z.object({
  id: z.string(),
  graph: z.object({
    id: z.string(),
    tenant: z.string(),
    runId: z.string(),
    rootPlanId: z.string(),
    nodes: z.array(
      z.object({
        id: z.string(),
        graphId: z.string(),
        name: z.string(),
        group: z.string(),
        weight: z.number().nonnegative(),
        severity: z.enum(['info', 'warning', 'critical']),
        urgency: z.enum(['low', 'medium', 'high']),
        state: z.enum(['pending', 'active', 'deferred', 'blocked', 'resolved']),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
        stateAt: z.string().datetime(),
        version: z.number().int().nonnegative(),
        metadata: z.object({
          owner: z.string(),
          region: z.string(),
          labels: z.array(z.string()),
          tags: z.array(z.string()),
          tagsVersion: z.number().int().nonnegative(),
        }),
      }),
    ),
    edges: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        order: z.number().int().nonnegative(),
        latencyBudgetMs: z.number().int().positive(),
        cost: z.number().nonnegative(),
        confidence: z.number().min(0).max(1),
      }),
    ),
    waves: z.array(
      z.object({
        id: z.string(),
        graphId: z.string(),
        title: z.string(),
        index: z.number().int().nonnegative(),
        commands: z.array(
          z.object({
            id: z.string(),
            graphId: z.string(),
            name: z.string(),
            group: z.string(),
            weight: z.number().nonnegative(),
            severity: z.enum(['info', 'warning', 'critical']),
            urgency: z.enum(['low', 'medium', 'high']),
            state: z.enum(['pending', 'active', 'deferred', 'blocked', 'resolved']),
            createdAt: z.string().datetime(),
            updatedAt: z.string().datetime(),
            stateAt: z.string().datetime(),
            version: z.number().int().nonnegative(),
            metadata: z.object({
              owner: z.string(),
              region: z.string(),
              labels: z.array(z.string()),
              tags: z.array(z.string()),
              tagsVersion: z.number().int().nonnegative(),
            }),
          }),
        ),
        dependsOn: z.array(z.string()),
        executionState: z.enum(['queued', 'running', 'successful', 'failed', 'retry']),
        startedAt: z.string().datetime().optional(),
        endedAt: z.string().datetime().optional(),
      }),
    ),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    metadata: z.object({
      source: z.enum(['planner', 'planner-v2']),
      revision: z.number().int().nonnegative(),
      requestedBy: z.string(),
      notes: z.array(z.string()),
    }),
  }),
  createdAt: z.string().datetime(),
});

export const commandGraphQuerySchema = z.object({
  tenant: z.string().optional(),
  runId: z.string().optional(),
  limit: z.number().int().positive().max(5000).optional(),
  cursor: z.string().optional(),
});

export const validateCommandGraphEnvelope = (value: unknown): CommandGraphEnvelope => {
  const parsed = commandGraphEnvelopeSchema.parse(value);
  return {
    id: parsed.id as CommandGraphStoreId,
    graph: parseCommandGraph(parsed.graph),
    createdAt: parsed.createdAt,
  };
};

export const validateQuery = (query: CommandGraphQuery): CommandGraphQuery => {
  const parsed = commandGraphQuerySchema.parse(query);
  return parsed;
};

export const resolveStoreId = (graphId: string): CommandGraphStoreId =>
  `${graphId}:store` as CommandGraphStoreId;

export const parseStoreId = (value: string): CommandGraphStoreId => {
  commandGraphStoreIdSchema.parse(value);
  return value as CommandGraphStoreId;
};

export const resolveRecordId = (graphId: string, sequence: number): CommandGraphRecordId => {
  commandSynthesisRecordId.parse(`${graphId}:${sequence}:record`);
  return `${graphId}:${sequence}:record` as CommandGraphRecordId;
};

export const buildTimelineScore = (records: readonly CommandSynthesisRecord[]): number =>
  records.reduce<number>(
    (acc, record) => acc + record.outcome.readinessScore + record.outcome.forecastMinutes + record.outcome.criticalPaths.length,
    0,
  );

export const isSuccessful = (result: CommandSynthesisResult): boolean =>
  result.ready && result.forecastMinutes > 0 && result.conflicts.length < 5;

export const aggregateRecordIds = (records: readonly CommandSynthesisRecord[]): readonly string[] =>
  records.map((record) => record.id as string).toSorted();
