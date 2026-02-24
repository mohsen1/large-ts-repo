import { z } from 'zod';

import { type MeshRunId } from '@domain/recovery-fusion-intelligence';

export interface MeshPhaseAggregate {
  readonly runId: MeshRunId;
  readonly waveCount: number;
  readonly commandCount: number;
  readonly warningCount: number;
  readonly warningRatio: number;
}

export const meshSummarySchema = z.object({
  runId: z.string(),
  waveCount: z.number().min(0),
  commandCount: z.number().min(0),
  warningCount: z.number().min(0),
});

export const toSummary = (input: {
  readonly runId: MeshRunId;
  readonly waveCount: number;
  readonly commandCount: number;
  readonly warningCount: number;
}): MeshPhaseAggregate => {
  const ratio = input.commandCount === 0 ? 0 : input.warningCount / input.commandCount;
  return {
    runId: input.runId,
    waveCount: input.waveCount,
    commandCount: input.commandCount,
    warningCount: input.warningCount,
    warningRatio: ratio,
  };
};

export const summarize = (input: MeshPhaseAggregate): string =>
  `run=${input.runId},waves=${input.waveCount},commands=${input.commandCount},warnings=${input.warningCount}`;
