import type { StabilityEnvelope } from './models';

export interface StabilityEnvelopeEnvelope {
  readonly name: string;
  readonly createdAt: string;
  readonly envelope: StabilityEnvelope;
}

export interface ApiStabilityEnvelope {
  readonly run_id: string;
  readonly created_at: string;
  readonly payload: StabilityEnvelope;
}

export const toApiEnvelope = (name: string, envelope: StabilityEnvelope): ApiStabilityEnvelope => ({
  run_id: envelope.id,
  created_at: new Date().toISOString(),
  payload: envelope,
});

export const decorateEnvelope = (
  name: string,
  envelope: StabilityEnvelope,
): StabilityEnvelopeEnvelope => ({
  name,
  createdAt: envelope.topology.createdAt,
  envelope,
});
