import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import { createEnvelope, type Envelope } from '@shared/protocol';

import { parseRiskSignal } from '@domain/recovery-risk-models';
import type { RiskSignal } from '@domain/recovery-risk-models';

export interface RecoveryRiskEnvelopeCodec {
  decode(input: Envelope<unknown>): Result<RiskSignal, Error>;
  encode(signal: RiskSignal): Envelope<RiskSignal>;
}

export const decodeRiskSignal = (input: Envelope<unknown>): Result<RiskSignal, Error> => {
  try {
    const signal = parseRiskSignal(input.payload);
    return ok(signal);
  } catch (error) {
    return fail(error instanceof Error ? error : new Error(String(error)));
  }
};

export const encodeRiskArtifact = (signal: RiskSignal): Envelope<RiskSignal> =>
  createEnvelope<RiskSignal>('recovery.risk.signal.v1', signal);

export const parseRiskSignalFromEnvelope = (payload: Envelope<unknown>): Result<RiskSignal, Error> => decodeRiskSignal(payload);

export class RecoveryRiskAdapter implements RecoveryRiskEnvelopeCodec {
  decode(input: Envelope<unknown>): Result<RiskSignal, Error> {
    return decodeRiskSignal(input);
  }
  encode(signal: RiskSignal): Envelope<RiskSignal> {
    return encodeRiskArtifact(signal);
  }
}
