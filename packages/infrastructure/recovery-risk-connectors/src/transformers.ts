import { z } from 'zod';
import { fail, ok, type Result } from '@shared/result';
import type { RiskConnectorEnvelope, PublishedSignalPack, RiskConnectorOutcome } from './types';
import type { StrategyExecutionResult, StrategySignalPack } from '@domain/recovery-risk-strategy';

const connectorEnvelopeSchema = z.object({
  connectorId: z.string().min(1),
  kind: z.enum(['signal-pack', 'strategy-result', 'timeline-tick']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  correlationId: z.string().min(1),
  payload: z.object({
    strategyRun: z.record(z.unknown()),
    vectorPack: z.record(z.unknown()),
    summary: z.string().min(1),
  }),
  createdAt: z.string().datetime(),
});

export const parseConnectorEnvelope = (value: unknown): Result<RiskConnectorEnvelope, Error> => {
  const parsed = connectorEnvelopeSchema.safeParse(value);
  if (!parsed.success) {
    return fail(parsed.error);
  }

  return ok({
    ...parsed.data,
    connectorId: parsed.data.connectorId as RiskConnectorEnvelope['connectorId'],
    correlationId: parsed.data.correlationId as RiskConnectorEnvelope['correlationId'],
    payload: {
      strategyRun: parsed.data.payload.strategyRun as unknown as RiskConnectorEnvelope['payload']['strategyRun'],
      vectorPack: parsed.data.payload.vectorPack as unknown as RiskConnectorEnvelope['payload']['vectorPack'],
      summary: parsed.data.payload.summary,
    },
  });
};

export const parsePublishedPack = (value: unknown): Result<PublishedSignalPack, Error> => {
  const envelope = parseConnectorEnvelope(value);
  if (!envelope.ok) {
    return fail(envelope.error);
  }

  const pack = envelope.value.payload as unknown as PublishedSignalPack;
  if (typeof pack.strategyRun !== 'object' || typeof pack.vectorPack !== 'object') {
    return fail(new Error('payload-invalid'));
  }

  return ok({
    envelope: envelope.value,
    strategyRun: pack.strategyRun as StrategyExecutionResult['run'],
    vectorPack: pack.vectorPack as StrategySignalPack,
  });
};

export const makePayload = (
  connectorId: string,
  kind: RiskConnectorEnvelope['kind'],
  severity: RiskConnectorEnvelope['severity'],
  strategyRun: StrategyExecutionResult['run'],
  vectorPack: StrategySignalPack,
): RiskConnectorEnvelope => {
  const correlationId = `${connectorId}:corr` as RiskConnectorEnvelope['correlationId'];

  return {
    connectorId: connectorId as RiskConnectorEnvelope['connectorId'],
    kind,
    severity,
    correlationId,
    payload: {
      strategyRun,
      vectorPack,
      summary: `${strategyRun.runId}:${strategyRun.scenarioId}:${strategyRun.score}`,
    },
    createdAt: new Date().toISOString(),
  };
};

export const normalizeOutcome = (result: Result<RiskConnectorOutcome, Error>): RiskConnectorOutcome => {
  return result.ok ? result.value : 'rejected';
};
