import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoverySignal, RunPlanSnapshot, RunSession } from './types';
import type { RecoveryProgram } from '@domain/recovery-orchestration';

export type IntentSignal = Brand<string, 'IntentSignal'>;
export type CommandIntentId = Brand<string, 'CommandIntentId'>;

export interface CommandIntentSlot {
  readonly intentId: CommandIntentId;
  readonly tenant: string;
  readonly signalIds: readonly string[];
  readonly readinessScore: number;
  readonly confidence: number;
  readonly urgency: 'low' | 'normal' | 'high' | 'critical';
  readonly tags: readonly string[];
}

export interface CommandIntentTrace {
  readonly signalId: IntentSignal;
  readonly source: string;
  readonly observedAt: string;
  readonly score: number;
}

export interface CommandIntentContext {
  readonly tenant: string;
  readonly planId: string;
  readonly program: RecoveryProgram;
  readonly snapshot: RunPlanSnapshot;
}

export interface CommandIntentResult {
  readonly intentId: CommandIntentId;
  readonly tenant: string;
  readonly slots: readonly CommandIntentSlot[];
  readonly signals: readonly CommandIntentTrace[];
  readonly aggregateScore: number;
  readonly readinessCoverage: number;
  readonly generatedAt: string;
}

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const inferUrgency = (severity: number, confidence: number): CommandIntentSlot['urgency'] => {
  const score = severity * confidence;
  if (score >= 7.5) return 'critical';
  if (score >= 5) return 'high';
  if (score >= 2.5) return 'normal';
  return 'low';
};

const toIntentSlot = (
  tenant: string,
  planId: string,
  signal: RecoverySignal,
  index: number,
): CommandIntentSlot => {
  const score = clamp(signal.severity * signal.confidence, 0, 10);
  return {
    intentId: withBrand(`${tenant}:${planId}:${signal.id}:${index}`, 'CommandIntentId'),
    tenant,
    signalIds: [signal.id],
    readinessScore: Number((score / 10).toFixed(4)),
    confidence: signal.confidence,
    urgency: inferUrgency(signal.severity, signal.confidence),
    tags: [signal.source, signal.id.split('-')[0] ?? signal.source],
  };
};

const dedupeBySource = (slots: readonly CommandIntentSlot[]): readonly CommandIntentSlot[] => {
  const map = new Map<string, CommandIntentSlot>();
  for (const slot of slots) {
    const key = `${slot.tenant}:${slot.tags.join('|')}`;
    const existing = map.get(key);
    if (!existing || existing.readinessScore < slot.readinessScore) {
      map.set(key, slot);
    }
  }
  return [...map.values()];
};

const buildSignals = (signals: readonly RecoverySignal[]): readonly CommandIntentTrace[] =>
  signals.map((signal) => ({
    signalId: withBrand(signal.id, 'IntentSignal'),
    source: signal.source,
    observedAt: signal.detectedAt,
    score: signal.severity * signal.confidence,
  }));

const buildReadinessCoverage = (plan: RecoveryReadinessPlan, traces: readonly CommandIntentTrace[]): number => {
  const maxSignals = Math.max(1, Math.max(10, plan.signals.length));
  const observedSignals = traces.length;
  return clamp(observedSignals / maxSignals, 0, 1);
};

const computeAggregate = (slots: readonly CommandIntentSlot[]): number => {
  if (!slots.length) return 0;
  const total = slots.reduce((sum, slot) => sum + slot.readinessScore * slot.confidence, 0);
  return Number((total / slots.length).toFixed(4));
};

export const buildCommandIntentMatrix = (
  session: RunSession,
  snapshot: RunPlanSnapshot,
  readinessPlan: RecoveryReadinessPlan,
): CommandIntentResult => {
  const baseSignals = session.signals.filter((signal) => signal.severity > 0);
  const slots = baseSignals.map((signal, index) => toIntentSlot(String(session.id), String(snapshot.id), signal, index));
  const deduped = dedupeBySource(slots);
  const traces = buildSignals(baseSignals);

  return {
    intentId: withBrand(`${session.runId}:${snapshot.id}`, 'CommandIntentId'),
    tenant: readinessPlan.metadata.tenant ?? 'global',
    slots: deduped,
    signals: traces,
    aggregateScore: computeAggregate(deduped),
    readinessCoverage: buildReadinessCoverage(readinessPlan, traces),
    generatedAt: new Date().toISOString(),
  };
};

export const summarizeIntentMatrix = (result: CommandIntentResult): string => {
  const grouped = result.slots.reduce(
    (acc, slot) => {
      acc[slot.urgency] += 1;
      return acc;
    },
    { low: 0, normal: 0, high: 0, critical: 0 } as Record<CommandIntentSlot['urgency'], number>,
  );

  const topSignals = result.signals
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((trace) => `${trace.signalId.toString()}:${trace.score.toFixed(2)}`)
    .join(', ');

  return `tenant=${result.tenant} intents=${result.slots.length} score=${result.aggregateScore} ` +
    `critical=${grouped.critical} high=${grouped.high} normal=${grouped.normal} low=${grouped.low} ` +
    `coverage=${result.readinessCoverage.toFixed(2)} top=[${topSignals}]`;
};

export const toCommandIntentContext = (
  tenant: string,
  sessionId: string,
  snapshot: RunPlanSnapshot,
): CommandIntentContext => ({
  tenant,
  planId: String(snapshot.id),
  program: snapshot.program,
  snapshot,
});
