import type { IncidentForecast, SignalBundle, IncidentSignal } from '@domain/recovery-incident-insights/src';
import { fail, ok, type Result } from '@shared/result';

const stableStringify = (value: unknown): string => JSON.stringify(value);

export const encodeSignal = (signal: IncidentSignal): Result<string, Error> => {
  try {
    return ok(stableStringify(signal));
  } catch (error) {
    return fail(error as Error);
  }
};

export const decodeSignal = (raw: string): Result<IncidentSignal, Error> => {
  try {
    return ok(JSON.parse(raw) as IncidentSignal);
  } catch (error) {
    return fail(error as Error);
  }
};

export const encodeBundle = (bundle: SignalBundle): Result<string, Error> => {
  try {
    return ok(stableStringify(bundle));
  } catch (error) {
    return fail(error as Error);
  }
};

export const encodeForecast = (forecast: IncidentForecast): Result<string, Error> => {
  try {
    return ok(stableStringify(forecast));
  } catch (error) {
    return fail(error as Error);
  }
};

export const decodeBundle = (raw: string): Result<SignalBundle, Error> => {
  try {
    return ok(JSON.parse(raw) as SignalBundle);
  } catch (error) {
    return fail(error as Error);
  }
};
