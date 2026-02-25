import { NoInfer } from '@shared/type-level';
import {
  type SignalOrchestratorOutput,
  summarizeSignalOrchestrator,
} from './signal-orchestrator-service';

export type EventSeverity = 'trace' | 'info' | 'warn' | 'error';

export interface SignalObservation {
  readonly at: string;
  readonly severity: EventSeverity;
  readonly tenantId: string;
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface TraceTimeline<TPayload = unknown> {
  readonly timeline: readonly SignalObservation[];
  readonly summary: string;
  readonly payload: TPayload;
}

interface ObserverConfig {
  readonly tenantId: string;
  readonly namespace: string;
  readonly level: EventSeverity;
}

const levelRank: Record<EventSeverity, number> = {
  trace: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export const withObservation = <
  const TPayload,
>(
  payload: NoInfer<TPayload>,
  namespace: string,
  tenantId: string,
): TraceTimeline<TPayload> => {
  const now = new Date().toISOString();
  return {
    timeline: [
      {
        at: now,
        severity: 'info',
        tenantId,
        message: `observer:init:${namespace}`,
        metadata: {
          namespace,
          payloadType: typeof payload,
        },
      },
    ],
    summary: `observer:${tenantId}:${namespace}`,
    payload,
  };
};

export const recordObservation = (
  timeline: readonly SignalObservation[],
  update: string,
  severity: EventSeverity = 'info',
): SignalObservation[] => {
  const extra: SignalObservation = {
    at: new Date().toISOString(),
    severity,
    tenantId: timeline.at(-1)?.tenantId ?? 'unknown',
    message: update,
    metadata: { updateLength: update.length },
  };
  return [...timeline, extra];
};

const sortBySeverity = (observations: readonly SignalObservation[]): readonly SignalObservation[] => {
  return [...observations].sort((left, right) => levelRank[left.severity] - levelRank[right.severity]);
};

export const buildObservationFromOutputs = (
  outputs: readonly SignalOrchestratorOutput[],
): TraceTimeline<readonly SignalOrchestratorOutput[]> => {
  const timeline = outputs.flatMap((output) => {
    const base = withObservation([output], 'signal-orchestrator', String(output.tenantId));
    const chainDigest = output.chain.digest;
    const chained = recordObservation(base.timeline, `chain=${chainDigest}`, 'info');
    const summary = summarizeSignalOrchestrator(output);
    return recordObservation(
      chained,
      `summary=${summary}`,
      output.chain.events.length > 2 ? 'warn' : 'trace',
    );
  });

  const sorted = sortBySeverity(timeline);
  return {
    timeline: sorted,
    summary: `batch:${sorted.length}`,
    payload: outputs,
  };
};

export const reduceObservationCounts = (timeline: readonly SignalObservation[]): Record<EventSeverity, number> => {
  const counts = {
    trace: 0,
    info: 0,
    warn: 0,
    error: 0,
  };
  for (const entry of timeline) {
    counts[entry.severity] += 1;
  }
  return counts;
};

export const mergeObservations = (
  left: readonly SignalObservation[],
  right: readonly SignalObservation[],
): readonly SignalObservation[] => {
  const leftOnly = [...left, ...right].toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return leftOnly;
};

export const toObservationReport = (
  timeline: readonly SignalObservation[],
  tenantId: string,
): string => {
  const counts = reduceObservationCounts(timeline);
  return `${tenantId}:${timeline.length}:${counts.info}:${counts.warn}:${counts.error}`;
};

export const buildScopedObserver = (config: ObserverConfig) => ({
  namespace: config.namespace,
  tenantId: config.tenantId,
  emit: (output: SignalOrchestratorOutput): TraceTimeline<SignalOrchestratorOutput> => {
    const timeline = withObservation(output, config.namespace, config.tenantId);
    const severity: EventSeverity = config.level;
    const appended = recordObservation(
      timeline.timeline,
      `${config.namespace} output=${summarizeSignalOrchestrator(output)}`,
      severity,
    );
    return {
      timeline: appended,
      summary: `${config.tenantId}:${appended.length}`,
      payload: output,
    };
  },
});
