import { clampConfidence, CommandRunbook, RecoverySignal, RecoverySimulationResult, SeverityBand, StressPhase, TenantId, WorkloadId } from './models';
import { isPhaseAllowed } from './policy';
import type { PolicyProfile } from './policy';
import { asMinutes } from './schedule';

export interface SimulationInput {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly selectedSignals: readonly RecoverySignal[];
  readonly runbooks: readonly CommandRunbook[];
  readonly profile: PolicyProfile;
  readonly nowIso: string;
}

interface BandProfile {
  readonly multiplier: number;
  readonly noise: number;
}

const BAND_SETTINGS: Record<SeverityBand, BandProfile> = {
  low: { multiplier: 0.7, noise: 0.12 },
  medium: { multiplier: 0.9, noise: 0.18 },
  high: { multiplier: 1.2, noise: 0.25 },
  critical: { multiplier: 1.6, noise: 0.34 },
};

export const simulateRunbook = (
  input: SimulationInput,
): RecoverySimulationResult => {
  const settings = BAND_SETTINGS[input.band];
  const now = new Date(input.nowIso);
  const baseSeed = Number.isFinite(now.getTime()) ? now.getTime() % 1000 : 0;
  const signalPenalty = Math.min(input.selectedSignals.length, 20) * 0.02;
  let confidence = 1;
  let blockedRuns = 0;
  const notes: string[] = [];
  const ticks: RecoverySimulationResult['ticks'] = [];
  const mutableTicks: Array<RecoverySimulationResult['ticks'][number]> = [];
  let activeWorkloads = 0;

  const selectedRunbooks = input.runbooks.filter((runbook) => {
    if (runbook.steps.length === 0) {
      notes.push(`Runbook ${runbook.name} has no steps and is excluded`);
      blockedRuns += 1;
      return false;
    }
    return true;
  });

  for (let minute = 0; minute < 240; minute += 1) {
    const clockMinute = asMinutes(new Date(now.getTime() + minute * 60 * 1000).toISOString());
    const minuteWorkloadSet = new Set<WorkloadId>();

    for (const runbook of selectedRunbooks) {
      const stepIndex = Math.min(Math.floor(minute / 15), runbook.steps.length - 1);
      const phase = runbook.steps[stepIndex]?.phase ?? 'standdown';
      if (!isPhaseAllowed(input.profile, input.band, phase)) {
        continue;
      }

      const estimated = runbook.steps[stepIndex]?.estimatedMinutes ?? 1;
      const projectedWorkload = Math.min(runbook.steps.length, estimated);
      const workloadId = runbook.id as unknown as WorkloadId;
      if (minute % estimated === 0) {
        minuteWorkloadSet.add(workloadId);
        notes.push(`Executing ${runbook.name} step ${stepIndex + 1} (${phase}) at ${clockMinute}`);
      }
      confidence *= 0.999 - (minute / 30000) * 0.02;
      confidence -= estimated * 0.00001;
      const jitter = ((minute + baseSeed) % 97) / 97;
      confidence -= (jitter * settings.noise) / 100;
      if (jitter > settings.multiplier && projectedWorkload > input.profile.maxConcurrent) {
        confidence -= 0.003;
      }
    }

    const blockedInMinute = Math.max(0, selectedRunbooks.length - input.profile.maxConcurrent);
    confidence -= blockedInMinute * 0.001;
    confidence = clampConfidence(confidence - signalPenalty);

    activeWorkloads = minuteWorkloadSet.size;
    mutableTicks.push({
      timestamp: new Date(now.getTime() + minute * 60 * 1000).toISOString(),
      activeWorkloads,
      blockedWorkloads: Array.from(minuteWorkloadSet),
      confidence,
    });

    if (tickShouldStop(minute, input.band, confidence)) {
      break;
    }
  }

  const completionFactor = mutableTicks.length / 240;
  const slaCompliance = clampConfidence(completionFactor * settings.multiplier);
  const riskScore = clampConfidence(1 - confidence);
  const finishedAt = mutableTicks.length > 0 ? mutableTicks[mutableTicks.length - 1].timestamp : input.nowIso;

  return {
    tenantId: input.tenantId,
    startedAt: input.nowIso,
    endedAt: finishedAt,
    selectedRunbooks: selectedRunbooks.map((runbook) => runbook.id),
    ticks: mutableTicks,
    riskScore,
    slaCompliance,
    notes,
  };
};

const tickShouldStop = (minute: number, band: SeverityBand, confidence: number): boolean => {
  if (minute < 20) return false;
  if (band === 'critical' && minute >= 200) return true;
  if (band === 'high' && minute >= 180) return true;
  if (band === 'medium' && minute >= 150) return true;
  return confidence < 0.05;
};

export const simulateThroughput = (activeWorkloads: number, steps: number): number => {
  if (!Number.isFinite(activeWorkloads) || !Number.isFinite(steps)) return 0;
  if (activeWorkloads <= 0 || steps <= 0) return 0;
  const contention = Math.max(0.2, 1 - activeWorkloads / 10);
  return Math.max(0, Math.round(1000 * (contention * (steps / 10))));
};

export const compareSimulations = (
  current: RecoverySimulationResult,
  candidate: RecoverySimulationResult,
): ReadonlyArray<string> => {
  const messages: string[] = [];
  const riskDelta = candidate.riskScore - current.riskScore;
  const slaDelta = candidate.slaCompliance - current.slaCompliance;

  if (riskDelta < -0.1) {
    messages.push('Candidate has lower risk profile by >10%.');
  }
  if (slaDelta < -0.1) {
    messages.push('SLA compliance regressed by >10%.');
  }
  if (candidate.ticks.length > current.ticks.length) {
    messages.push('Candidate extends plan duration but may provide better validation coverage.');
  }
  return messages;
};
