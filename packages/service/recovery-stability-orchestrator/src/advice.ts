import { deriveRiskScore, computeDecisionEnvelope, type DecisionEnvelope } from '@domain/recovery-stability-models';
import type {
  ComponentRisk,
  StabilitySignal,
  StabilityRunId,
} from '@domain/recovery-stability-models';

export interface StabilityAdviceRequest {
  readonly runId: StabilityRunId;
  readonly signals: readonly StabilitySignal[];
  readonly componentRisks: ReadonlyArray<ComponentRisk>;
}

export interface StabilityAdvice {
  readonly runId: StabilityRunId;
  readonly envelope: DecisionEnvelope;
  readonly actions: ReadonlyArray<string>;
  readonly reasonSummary: string;
}

const classifySignal = (signal: StabilitySignal): string => {
  if (signal.value <= 0) return 'no-impact';
  if (signal.value < signal.threshold * 0.5) return 'stable';
  if (signal.value < signal.threshold * 0.85) return 'watch';
  return 'critical';
};

export const buildActions = (
  signals: readonly StabilitySignal[],
): ReadonlyArray<string> => {
  const criticalByClass = new Map<string, number>();
  for (const signal of signals) {
    if (classifySignal(signal) === 'critical') {
      criticalByClass.set(signal.alertClass, (criticalByClass.get(signal.alertClass) ?? 0) + 1);
    }
  }

  const actions: string[] = [];
  for (const [alertClass, count] of criticalByClass.entries()) {
    if (count >= 3) {
      actions.push(`Throttling playbook for ${alertClass} class`);
    } else {
      actions.push(`Inspect ${alertClass} signal growth`);
    }
  }

  if (actions.length === 0) {
    actions.push('Keep run in normal monitoring mode');
  }

  return actions;
};

export const scoreSignalsToPercent = (signals: readonly StabilitySignal[]): number => {
  if (signals.length === 0) return 100;
  const probabilities = signals.map((signal) => {
    const ratio = signal.threshold > 0 ? signal.value / signal.threshold : 0;
    return ratio;
  });
  const impacts = signals.map((signal) => {
    const ratio = signal.threshold > 0 ? signal.value / signal.threshold : 0;
    return ratio * 100;
  });
  return deriveRiskScore(probabilities, impacts);
};

export const createAdvice = ({ runId, signals, componentRisks }: StabilityAdviceRequest): StabilityAdvice => {
  const riskScore = scoreSignalsToPercent(signals);
  const envelope = computeDecisionEnvelope(riskScore, componentRisks);
  const actions = buildActions(signals);
  const reasonSummary = `${actions.length} actions recommended from ${signals.length} signals`;

  return {
    runId,
    envelope,
    actions,
    reasonSummary,
  };
};
