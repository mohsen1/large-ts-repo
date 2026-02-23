import { z } from 'zod';
import type { RecoverySignal } from './types';
import type { RunSession, RunPlanSnapshot } from './types';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { withBrand } from '@shared/core';

export type IntentPhase = 'capture' | 'qualify' | 'prioritize' | 'execute';

export type IntentVector = 'risk' | 'cost' | 'speed' | 'compliance' | 'coordination';

export interface IntentSignal {
  readonly id: string;
  readonly phase: IntentPhase;
  readonly vector: IntentVector;
  readonly score: number;
  readonly reason: string;
  readonly createdAt: string;
}

export interface IntentBand {
  readonly tenant: string;
  readonly runId: string;
  readonly planId: string;
  readonly signals: readonly IntentSignal[];
  readonly envelope: string;
}

export interface IntentMatrix {
  readonly band: string;
  readonly confidence: number;
  readonly vector: IntentVector;
  readonly phase: IntentPhase;
  readonly selected: boolean;
}

export interface IntentEnvelope {
  readonly id: string;
  readonly matrix: readonly IntentMatrix[];
  readonly createdAt: string;
  readonly generatedBy: string;
}

export const IntentSignalSchema = z
  .object({
    id: z.string().min(1),
    phase: z.enum(['capture', 'qualify', 'prioritize', 'execute']),
    vector: z.enum(['risk', 'cost', 'speed', 'compliance', 'coordination']),
    score: z.number().min(0).max(1),
    reason: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();

const vectorWeights: Record<IntentVector, number> = {
  risk: 0.4,
  cost: 0.1,
  speed: 0.2,
  compliance: 0.2,
  coordination: 0.1,
};

const phaseOrder: readonly IntentPhase[] = ['capture', 'qualify', 'prioritize', 'execute'];

const inferPhase = (signal: Readonly<RecoverySignal>): IntentPhase => {
  if (signal.severity >= 8) return 'prioritize';
  if (signal.confidence >= 0.9) return 'qualify';
  if (signal.severity <= 3) return 'capture';
  return 'execute';
};

const inferVector = (signal: Readonly<RecoverySignal>): IntentVector => {
  const lowered = signal.source.toLowerCase();
  if (lowered.includes('cost') || lowered.includes('budget')) return 'cost';
  if (lowered.includes('sla') || lowered.includes('compliance')) return 'compliance';
  if (lowered.includes('coordination') || lowered.includes('dependency')) return 'coordination';
  if (lowered.includes('latency') || lowered.includes('throughput')) return 'speed';
  return 'risk';
};

const buildId = (tenant: string, phase: IntentPhase, vector: IntentVector): string => {
  return withBrand(`${tenant}:${phase}:${vector}:${Date.now()}`, 'RunPlanId');
};

const normalizeSignals = (signals: readonly RecoverySignal[]): readonly IntentSignal[] => {
  return signals.map((signal) => {
    const phase = inferPhase(signal);
    const vector = inferVector(signal);
    const score = Number(
      Math.max(0, Math.min(1, 0.3 + (phase === 'prioritize' ? 0.4 : 0) + vectorWeights[vector] * signal.confidence * signal.severity / 10))
        .toFixed(4),
    );
    return {
      id: String(signal.id),
      phase,
      vector,
      score,
      reason: signal.source,
      createdAt: new Date(signal.detectedAt).toISOString(),
    };
  });
};

const buildMatrix = (
  session: RunSession,
  readinessPlan: RecoveryReadinessPlan,
): readonly IntentMatrix[] => {
  const byPhase = Object.fromEntries(
    phaseOrder.map((phase) => [phase, 0]),
  ) as Record<IntentPhase, number>;

  for (const signal of session.signals) {
    const phase = inferPhase(signal);
    const vector = inferVector(signal);
    const normalized = Math.max(0, Math.min(1, signal.confidence + signal.severity / 10));
    byPhase[phase] = Number((byPhase[phase] + normalized * vectorWeights[vector]).toFixed(4));
  }

  return phaseOrder.flatMap((phase) =>
    (Object.keys(vectorWeights) as IntentVector[]).map((vector) => ({
      band: `${phase}-${vector}`,
      confidence: byPhase[phase],
      vector,
      phase,
      selected: byPhase[phase] > 0.4,
    })),
  );
};

export const buildIntentBand = (tenant: string, session: RunSession, plan: RunPlanSnapshot, readinessPlan: RecoveryReadinessPlan): IntentBand => {
  const signals = normalizeSignals(session.signals);
  const bandMatrix = buildMatrix(session, readinessPlan);
  const top = bandMatrix
    .filter((matrix) => matrix.selected)
    .sort((first, second) => second.confidence - first.confidence)[0];

  return {
    tenant,
    runId: String(session.runId),
    planId: String(plan.id),
    signals,
    envelope: top ? `${tenant}:${top.phase}:${top.vector}:${top.confidence.toFixed(2)}` : `${tenant}:neutral:${signals.length}`,
  };
};

export const buildIntentEnvelope = (
  tenant: string,
  session: RunSession,
  plan: RunPlanSnapshot,
  readinessPlan: RecoveryReadinessPlan,
): IntentEnvelope => {
  const band = buildIntentBand(tenant, session, plan, readinessPlan);
  const matrices = band.signals.flatMap((signal) => {
    const vector = inferVector(signal as unknown as RecoverySignal);
    const phase = inferPhase(signal as unknown as RecoverySignal);
    const confidence = Math.max(0.1, signal.score * vectorWeights[vector]);
    return [
      {
        band: `${band.envelope}:${signal.id}`,
        confidence,
        vector,
        phase,
        selected: confidence > 0.15,
      },
    ];
  });

  return {
    id: buildId(tenant, phaseOrder[0]!, 'risk'),
    matrix: matrices,
    createdAt: new Date().toISOString(),
    generatedBy: 'buildIntentEnvelope',
  };
};

export const scoreIntentEnvelope = (envelope: IntentEnvelope): number => {
  if (!envelope.matrix.length) {
    return 0;
  }
  return Number(
    (envelope.matrix.reduce((acc, matrix) => acc + matrix.confidence, 0) / envelope.matrix.length).toFixed(4),
  );
};

export const groupSignalsByVector = (
  signals: readonly RecoverySignal[],
): Record<IntentVector, readonly RecoverySignal[]> => {
  const buckets = {
    risk: [] as RecoverySignal[],
    cost: [] as RecoverySignal[],
    speed: [] as RecoverySignal[],
    compliance: [] as RecoverySignal[],
    coordination: [] as RecoverySignal[],
  };

  for (const signal of signals) {
    const vector = inferVector(signal);
    buckets[vector] = [...buckets[vector], signal];
  }

  return buckets;
};
