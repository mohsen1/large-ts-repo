import { parseRuntimeBundle } from './schema';
import type {
  ExperimentPlan,
  ExperimentIntent,
  ExperimentContext,
  ExperimentPayload,
  RuntimeEnvelope,
} from './types';

export interface WireEnvelope {
  readonly plan: unknown;
  readonly intent: unknown;
  readonly context: unknown;
  readonly payload: unknown;
}

export interface WireRecord {
  readonly envelope: string;
  readonly revision: string;
  readonly emittedAt: string;
}

export const encodeEnvelope = (envelope: RuntimeEnvelope): string =>
  JSON.stringify(envelope, null, 2);

export const hydrateEnvelope = (payload: string): RuntimeEnvelope => {
  const parsed = JSON.parse(payload) as WireEnvelope;
  return parseRuntimeBundle(parsed);
};

export const toWire = (envelope: RuntimeEnvelope): WireRecord => ({
  envelope: encodeEnvelope(envelope),
  revision: 'v1',
  emittedAt: new Date().toISOString(),
});

export const fromWire = (wire: WireRecord): RuntimeEnvelope => hydrateEnvelope(wire.envelope);

export const toEnvelopeParts = <TMetadata extends Record<string, unknown>>(envelope: RuntimeEnvelope<TMetadata>): {
  plan: ExperimentPlan<TMetadata>;
  intent: ExperimentIntent;
  context: ExperimentContext;
  metadata: TMetadata;
} => ({
  plan: envelope.plan,
  intent: envelope.intent,
  context: envelope.context,
  metadata: envelope.payload.metadata,
});

export const normalizeRuntimeEnvelope = <TMetadata extends Record<string, unknown>>(
  envelope: RuntimeEnvelope<TMetadata>,
): RuntimeEnvelope<TMetadata> => ({
  ...envelope,
  payload: {
    ...envelope.payload,
    metadata: envelope.payload.metadata as TMetadata,
  },
});

export const splitEnvelope = (envelope: RuntimeEnvelope): readonly [
  ExperimentPlan,
  ExperimentIntent,
  ExperimentContext,
  ExperimentPayload,
] => [envelope.plan, envelope.intent, envelope.context, envelope.payload];
