import { withBrand } from '@shared/core';
import type { RunPlanSnapshot, RecoverySignal, RunSession } from './types';
import type { RecoveryProgram, RecoveryStep } from '@domain/recovery-orchestration';

export type CommandSurfaceSignal = {
  readonly signalId: string;
  readonly source: string;
  readonly severity: number;
  readonly confidence: number;
  readonly observedAt: string;
};

export type CommandSurfaceSignalBucket = 'critical' | 'high' | 'medium' | 'low' | 'idle';

export interface CommandSurfaceEntry {
  readonly id: string;
  readonly planId: string;
  readonly stepId: string;
  readonly score: number;
  readonly bucket: CommandSurfaceSignalBucket;
  readonly signals: readonly CommandSurfaceSignal[];
  readonly actionWindowMs: number;
}

export interface CommandSurfaceSnapshot {
  readonly sessionId: string;
  readonly tenant: string;
  readonly generatedAt: string;
  readonly entries: readonly CommandSurfaceEntry[];
  readonly recommendation: string;
}

const bucketByScore = (score: number): CommandSurfaceSignalBucket => {
  if (score >= 8) return 'critical';
  if (score >= 6) return 'high';
  if (score >= 4) return 'medium';
  if (score >= 1) return 'low';
  return 'idle';
};

const signalScore = (signal: CommandSurfaceSignal): number => signal.severity * signal.confidence;

const clamp = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const commandWindowMs = (step: RecoveryStep, plan: RecoveryProgram): number => {
  const timeoutMs = Number.isFinite(step.timeoutMs) ? step.timeoutMs : 0;
  const dependencyFactor = step.dependencies.length * 60_000;
  const stepDensity = plan.steps.length > 0 ? plan.steps.length / 5 : 1;

  return Math.max(60_000, Math.round((timeoutMs + dependencyFactor) * clamp(1 + 0.4 / stepDensity)));
};

const readSignalHistory = (session: RunSession): readonly RecoverySignal[] => [...session.signals].sort((left, right) => left.detectedAt.localeCompare(right.detectedAt));

const toBuckets = (snapshot: { planId: string; program: RecoveryProgram; signals: readonly RecoverySignal[] }) => {
  const byStep = new Map<string, CommandSurfaceSignal[]>();
  for (const signal of snapshot.signals) {
    const mapped: CommandSurfaceSignal = {
      signalId: signal.id,
      source: signal.source,
      severity: signal.severity,
      confidence: clamp(signal.confidence),
      observedAt: signal.detectedAt,
    };
    const key = signal.id.includes(':') ? signal.id.split(':')[0] : signal.source;
    const current = byStep.get(key) ?? [];
    byStep.set(key, [...current, mapped]);
  }

  const entries = snapshot.program.steps.map((step): CommandSurfaceEntry => {
    const related = byStep.get(step.id) ?? [];
    const score = related.reduce((acc, signal) => acc + signalScore(signal) / 10, 0);
    const bucket = bucketByScore(score);

    return {
      id: `${snapshot.planId}-${step.id}`,
      planId: snapshot.planId,
      stepId: step.id,
      score: Number((score / (related.length || 1)).toFixed(4)),
      bucket,
      signals: related,
      actionWindowMs: commandWindowMs(step, snapshot.program),
    };
  });

  return entries;
};

const recommendAction = (entries: readonly CommandSurfaceEntry[]): string => {
  const critical = entries.filter((entry) => entry.bucket === 'critical').length;
  const medium = entries.filter((entry) => entry.bucket === 'medium').length;
  const high = entries.filter((entry) => entry.bucket === 'high').length;

  if (critical > 0) return 'Immediate operator escalation required';
  if (high >= 2) return 'Coordinate parallel execution and open command window';
  if (medium >= 3) return 'Raise team alerts and pre-stage dependencies';
  return `Nominal surface state, ${entries.length - high - medium} passive nodes`;
};

export const buildCommandSurface = (
  session: RunSession,
  snapshot: RunPlanSnapshot,
): CommandSurfaceSnapshot => {
  const entries = toBuckets({
    planId: snapshot.id,
    program: snapshot.program,
    signals: readSignalHistory(session),
  });

  const recommendation = recommendAction(entries);

  return {
    sessionId: withBrand(`${session.runId}-${session.ticketId}`, 'RunSessionId'),
    tenant: String(session.id).split(':')[0] ?? 'global',
    generatedAt: new Date().toISOString(),
    entries,
    recommendation,
  };
};

export const normalizeEntryScore = (entry: CommandSurfaceEntry): number => {
  if (entry.bucket === 'critical') return 1;
  if (entry.bucket === 'high') return 0.8;
  if (entry.bucket === 'medium') return 0.5;
  if (entry.bucket === 'low') return 0.2;
  return 0;
};

export const summarizeSurface = (snapshot: CommandSurfaceSnapshot): Record<string, number> => {
  const average = snapshot.entries.length
    ? snapshot.entries.reduce((acc, entry) => acc + normalizeEntryScore(entry), 0) / snapshot.entries.length
    : 0;

  return {
    entries: snapshot.entries.length,
    average,
    critical: snapshot.entries.filter((entry) => entry.bucket === 'critical').length,
    high: snapshot.entries.filter((entry) => entry.bucket === 'high').length,
    medium: snapshot.entries.filter((entry) => entry.bucket === 'medium').length,
    low: snapshot.entries.filter((entry) => entry.bucket === 'low').length,
  };
};
