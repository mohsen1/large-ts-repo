import type { Brand } from '@shared/core';
import type { Result } from '@shared/result';
import type { RiskWindowId, StrategyExecutionResult, StrategySignalPack } from '@domain/recovery-risk-strategy';

export type RiskConnectorOutcome = 'accepted' | 'rejected' | 'deferred' | 'published';

export interface RiskConnectorEnvelope {
  readonly connectorId: Brand<string, 'RiskConnectorId'>;
  readonly kind: 'signal-pack' | 'strategy-result' | 'timeline-tick';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly correlationId: Brand<string, 'TraceId'>;
  readonly payload: {
    readonly strategyRun: StrategyExecutionResult['run'];
    readonly vectorPack: StrategySignalPack;
    readonly summary: string;
  };
  readonly createdAt: string;
}

export interface PublishedSignalPack {
  readonly envelope: RiskConnectorEnvelope;
  readonly strategyRun: StrategyExecutionResult['run'];
  readonly vectorPack: StrategySignalPack;
}

export interface RiskConnector {
  publish(pack: PublishedSignalPack): Promise<Result<RiskConnectorOutcome, Error>>;
}

export interface ConnectorMetrics {
  readonly totalPublished: number;
  readonly totalAccepted: number;
  readonly totalRejected: readonly {
    readonly reason: string;
    readonly count: number;
  }[];
}

export interface ConnectorEnvelopePayload {
  readonly runId: RiskWindowId;
  readonly scenarioId: Brand<string, 'RiskScenarioId'>;
  readonly severity: 'green' | 'yellow' | 'red' | 'black';
}
