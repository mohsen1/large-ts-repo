import type { FusionBundle, FusionWave, FusionWaveId } from './types';
import { withBrand } from '@shared/core';
import type { Brand } from '@shared/type-level';

type ResourceId = Brand<string, 'FusionResource'>;

export interface ResourceSlot {
  readonly id: ResourceId;
  readonly unit: string;
  readonly capacity: number;
  readonly cost: number;
}

export interface ResourcePlan {
  readonly waveId: FusionWaveId;
  readonly planId: string;
  readonly required: number;
  readonly available: number;
  readonly utilization: number;
  readonly slots: readonly ResourceSlot[];
}

export interface ResourceDistribution {
  readonly bundleId: string;
  readonly totalRequired: number;
  readonly totalAvailable: number;
  readonly utilization: number;
  readonly byWave: readonly ResourcePlan[];
}

const unitFromState = (state: FusionWave['state']): string => {
  if (state === 'running') return 'cpu';
  if (state === 'blocked') return 'coordination';
  if (state === 'degraded') return 'memory';
  return 'io';
};

const asNumber = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
};

const computeCost = (state: FusionWave['state'], index: number): number => {
  const base = 10 + index * 2;
  if (state === 'running') return base * 1.35;
  if (state === 'stable') return base * 0.8;
  if (state === 'failed') return base * 4;
  return base;
};

const mapSlot = (wave: FusionWave, index: number): ResourceSlot => ({
  id: withBrand(`${wave.id}:slot:${index}`, 'FusionResource'),
  unit: unitFromState(wave.state),
  capacity: Math.max(1, 20 - index * 2 + Math.round(wave.score * 10)),
  cost: asNumber(computeCost(wave.state, index)),
});

const buildSlots = (waves: readonly FusionWave[]): readonly ResourceSlot[] =>
  waves.flatMap((wave, index) => {
    const count = Math.max(1, Math.floor(wave.commands.length));
    return [...new Array(Math.min(3, count))].map((_, commandIndex) => mapSlot(wave, index + commandIndex));
  });

const buildPerWavePlan = (wave: FusionWave, bundle: FusionBundle, slots: readonly ResourceSlot[]): ResourcePlan => {
  const waveSlots = slots.filter((slot) => String(slot.id).includes(wave.id));
  const required = wave.commands.length + wave.readinessSignals.length;
  const scorePressure = wave.score * 100;
  const available = waveSlots.reduce((sum, slot) => sum + slot.capacity, 0) + scorePressure;
  const utilization = required > 0 ? Math.min(1, required / Math.max(1, available)) : 0;
  return {
    waveId: wave.id,
    planId: String(bundle.id),
    required,
    available,
    utilization,
    slots: waveSlots,
  };
};

export const planResourceAllocation = (bundle: FusionBundle): ResourceDistribution => {
  const slots = buildSlots(bundle.waves);
  const byWave = bundle.waves.map((wave) => buildPerWavePlan(wave, bundle, slots));
  const totalRequired = byWave.reduce((sum, wavePlan) => sum + wavePlan.required, 0);
  const totalAvailable = byWave.reduce((sum, wavePlan) => sum + wavePlan.available, 0);
  const utilization = totalAvailable > 0 ? Math.min(1, totalRequired / totalAvailable) : 0;

  return {
    bundleId: String(bundle.id),
    totalRequired,
    totalAvailable,
    utilization,
    byWave,
  };
};

export const estimateExecutionSeconds = (bundle: FusionBundle): number => {
  const distribution = planResourceAllocation(bundle);
  const baseSeconds = bundle.waves.reduce((sum, wave) => sum + wave.commands.length * 8, 0);
  const pressure = Math.min(4, distribution.utilization * 4);
  const readiness = distribution.totalRequired > 0 ? Math.max(1, distribution.totalAvailable / distribution.totalRequired) : 1;
  return Math.round(baseSeconds * (1 + pressure) / readiness);
};

export const isResourceOvercommitted = (bundle: FusionBundle): boolean => {
  const utilization = planResourceAllocation(bundle).utilization;
  return utilization >= 0.9;
};
