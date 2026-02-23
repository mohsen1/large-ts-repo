import { Brand } from '@shared/type-level';
import { z } from 'zod';
import { commandSurfaceSchema } from '@domain/recovery-ops-orchestration-surface';
import type {
  OrchestrationRunRecord,
  SurfaceEnvelopeRecord,
} from './types';

const commandRiskEnum = z.enum(['low', 'medium', 'high', 'critical']);

const recordEnvelopeSchema = z.object({
  id: z.string().min(1),
  surface: commandSurfaceSchema,
  createdAt: z.string().datetime(),
  queryContext: z.object({
    tenantId: z.string().optional(),
    scenarioId: z.string().optional(),
    minPriority: z.number().optional(),
    maxRisk: commandRiskEnum.optional(),
  }),
  generatedBy: z.string().min(1),
  metadata: z.record(z.unknown()),
});

const orchestrationRunSchema = z.object({
  id: z.string().min(1),
  surfaceId: z.string().min(1),
  runAt: z.string().datetime(),
  planId: z.string().min(1),
  result: z.object({
    ok: z.boolean(),
    chosenPlanId: z.string().min(1),
    score: z.number(),
    riskScore: z.number(),
    projectedCompletionAt: z.string().datetime(),
    blockers: z.array(z.string()),
    coverage: z.array(
      z.object({
        phase: z.enum(['observe', 'stabilize', 'validate', 'scale', 'handoff']),
      coveredStepCount: z.number(),
        totalStepCount: z.number(),
      }),
    ),
    surface: commandSurfaceSchema,
  }),
  selected: z.boolean(),
  notes: z.array(z.string()),
});

const surfaceEnvelopeId = (value: string): Brand<string, 'SurfaceEnvelopeId'> => value as Brand<string, 'SurfaceEnvelopeId'>;
const orchestrationRunId = (value: string): Brand<string, 'OrchestrationRunId'> => value as Brand<string, 'OrchestrationRunId'>;
const commandPlanId = (value: string): Brand<string, 'CommandPlanId'> => value as Brand<string, 'CommandPlanId'>;

export const parseSurfaceEnvelope = (input: unknown): SurfaceEnvelopeRecord => {
  const parsed = recordEnvelopeSchema.parse(input) as { id: string; surface: unknown; createdAt: string; queryContext: unknown; generatedBy: string; metadata: Record<string, unknown> };
  return {
    ...parsed,
    id: surfaceEnvelopeId(parsed.id),
  } as SurfaceEnvelopeRecord;
};

export const parseOrchestrationRun = (input: unknown): OrchestrationRunRecord => {
  const parsed = orchestrationRunSchema.parse(input) as {
    id: string;
    surfaceId: string;
    runAt: string;
    planId: string;
    result: {
      ok: boolean;
      chosenPlanId: string;
      score: number;
      riskScore: number;
      projectedCompletionAt: string;
      blockers: string[];
      coverage: unknown[];
      surface: unknown;
    };
    selected: boolean;
    notes: string[];
  };

  return {
    ...parsed,
    result: {
      ...parsed.result,
      chosenPlanId: commandPlanId(parsed.result.chosenPlanId),
    },
    id: orchestrationRunId(parsed.id),
    surfaceId: parsed.surfaceId,
    planId: commandPlanId(parsed.planId),
  } as OrchestrationRunRecord;
};

export const encodeSurfaceEnvelope = (value: unknown): string => JSON.stringify(value);
export const decodeSurfaceEnvelope = (input: string) => recordEnvelopeSchema.parse(JSON.parse(input));

export const encodeOrchestrationRun = (value: unknown): string => JSON.stringify(value);
export const decodeOrchestrationRun = (input: string) => orchestrationRunSchema.parse(JSON.parse(input));
