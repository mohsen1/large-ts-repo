import type { IncidentSignal, SignalBundle } from '@domain/recovery-incident-insights/src';
import { buildPolicyDecision } from '@domain/recovery-incident-insights/src';
import { generateForecast } from '@domain/recovery-incident-insights/src';

export interface WorkflowInput {
  readonly bundle: SignalBundle;
  readonly candidateWindowMinutes: number;
}

export interface WorkflowOutcome {
  readonly forecast: ReturnType<typeof generateForecast>;
  readonly policies: ReturnType<typeof buildPolicyDecision>;
}

export const runForecastWorkflow = (input: WorkflowInput): WorkflowOutcome => {
  const forecast = generateForecast(input.bundle, input.candidateWindowMinutes, input.bundle.bundleId);
  const policyOutcome = buildPolicyDecision(input.bundle, input.candidateWindowMinutes);
  return {
    forecast,
    policies: policyOutcome,
  };
};

export const normalizeSignals = (signals: readonly IncidentSignal[]): IncidentSignal[] =>
  signals
    .map((signal) => signal)
    .filter((signal) => signal.confidence > 0)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
