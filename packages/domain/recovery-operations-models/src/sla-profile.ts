import type { Brand } from '@shared/core';
import type { RecoverySignal, IncidentFingerprint } from './types';

export interface SlaBandConfig {
  readonly name: 'critical' | 'standard' | 'gold';
  readonly responseMinutesTarget: number;
  readonly recoveryMinutesTarget: number;
  readonly confidence: number;
}

export interface SlaProfile {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly incidentClass: IncidentFingerprint['impactClass'];
  readonly bands: readonly SlaBandConfig[];
  readonly appliedBand: SlaBandConfig['name'];
  readonly updatedAt: string;
}

export interface SlaViolation {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly incidentId: Brand<string, 'RecoveryRunId'>;
  readonly band: SlaBandConfig['name'];
  readonly breachMinutes: number;
  readonly confidence: number;
}

const bandsByClass: Record<IncidentFingerprint['impactClass'], SlaProfile['bands']> = {
  infrastructure: [
    { name: 'critical', responseMinutesTarget: 5, recoveryMinutesTarget: 20, confidence: 0.9 },
    { name: 'standard', responseMinutesTarget: 30, recoveryMinutesTarget: 120, confidence: 0.75 },
    { name: 'gold', responseMinutesTarget: 120, recoveryMinutesTarget: 360, confidence: 0.6 },
  ],
  database: [
    { name: 'critical', responseMinutesTarget: 10, recoveryMinutesTarget: 45, confidence: 0.92 },
    { name: 'standard', responseMinutesTarget: 35, recoveryMinutesTarget: 150, confidence: 0.78 },
    { name: 'gold', responseMinutesTarget: 150, recoveryMinutesTarget: 400, confidence: 0.62 },
  ],
  network: [
    { name: 'critical', responseMinutesTarget: 3, recoveryMinutesTarget: 15, confidence: 0.88 },
    { name: 'standard', responseMinutesTarget: 20, recoveryMinutesTarget: 90, confidence: 0.72 },
    { name: 'gold', responseMinutesTarget: 90, recoveryMinutesTarget: 280, confidence: 0.58 },
  ],
  application: [
    { name: 'critical', responseMinutesTarget: 15, recoveryMinutesTarget: 60, confidence: 0.82 },
    { name: 'standard', responseMinutesTarget: 40, recoveryMinutesTarget: 180, confidence: 0.66 },
    { name: 'gold', responseMinutesTarget: 180, recoveryMinutesTarget: 420, confidence: 0.55 },
  ],
  'third-party': [
    { name: 'critical', responseMinutesTarget: 12, recoveryMinutesTarget: 70, confidence: 0.7 },
    { name: 'standard', responseMinutesTarget: 90, recoveryMinutesTarget: 260, confidence: 0.61 },
    { name: 'gold', responseMinutesTarget: 240, recoveryMinutesTarget: 600, confidence: 0.45 },
  ],
};

const scoreSignals = (signals: readonly RecoverySignal[]): number => {
  const activeSignals = signals.filter((signal) => signal.severity >= 4);
  if (activeSignals.length === 0) return 0;
  const severity = activeSignals.reduce((acc, signal) => acc + signal.severity, 0);
  const confidence = activeSignals.reduce((acc, signal) => acc + signal.confidence, 0);
  return Math.max(0, Math.min(1, (severity / (activeSignals.length * 10)) * (confidence / activeSignals.length)));
};

export const buildSlaProfile = (
  fingerprint: IncidentFingerprint,
  tenant: Brand<string, 'TenantId'>,
  signals: readonly RecoverySignal[],
): SlaProfile => {
  const selected = bandsByClass[fingerprint.impactClass] ?? bandsByClass.application;
  const signalScore = scoreSignals(signals);
  const appliedIndex = signalScore > 0.8 ? 0 : signalScore > 0.45 ? 1 : 2;
  return {
    tenant,
    incidentClass: fingerprint.impactClass,
    bands: [...selected],
    appliedBand: selected[appliedIndex]?.name ?? 'gold',
    updatedAt: new Date().toISOString(),
  };
};

export const estimateSlaBreachMinutes = (
  profile: SlaProfile,
  observedMinutes: number,
): SlaViolation[] => {
  const byName = new Map(profile.bands.map((band) => [band.name, band] as const));
  const applied = byName.get(profile.appliedBand);
  if (!applied) return [];

  const breaches: SlaViolation[] = [];
  if (observedMinutes > applied.responseMinutesTarget) {
    breaches.push({
      tenant: profile.tenant,
      incidentId: 'sla-incident' as Brand<string, 'RecoveryRunId'>,
      band: profile.appliedBand,
      breachMinutes: observedMinutes - applied.responseMinutesTarget,
      confidence: applied.confidence,
    });
  }

  if (observedMinutes > applied.recoveryMinutesTarget) {
    breaches.push({
      tenant: profile.tenant,
      incidentId: 'sla-incident' as Brand<string, 'RecoveryRunId'>,
      band: profile.appliedBand,
      breachMinutes: observedMinutes - applied.recoveryMinutesTarget,
      confidence: applied.confidence,
    });
  }

  return breaches;
};

export const selectSlaBandBySignal = (signals: readonly RecoverySignal[]): SlaProfile['bands'][number] | undefined => {
  const score = scoreSignals(signals);
  if (score >= 0.85) return { name: 'critical', responseMinutesTarget: 2, recoveryMinutesTarget: 20, confidence: 0.95 };
  if (score >= 0.6) return { name: 'standard', responseMinutesTarget: 15, recoveryMinutesTarget: 90, confidence: 0.83 };
  if (score >= 0.25) return { name: 'gold', responseMinutesTarget: 60, recoveryMinutesTarget: 180, confidence: 0.66 };
  return undefined;
};

export const compareSlaProfiles = (left: SlaProfile, right: SlaProfile): number => {
  const leftScore = left.bands.find((band) => band.name === left.appliedBand)?.confidence ?? 0;
  const rightScore = right.bands.find((band) => band.name === right.appliedBand)?.confidence ?? 0;
  return rightScore - leftScore;
};

export const slaProfileFingerprint = (profile: SlaProfile): string => {
  const band = profile.bands.find((entry) => entry.name === profile.appliedBand);
  if (!band) return `${profile.tenant}:none`;
  return `${profile.tenant}:${profile.appliedBand}:${band.responseMinutesTarget}/${band.recoveryMinutesTarget}`;
};
