import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type {
  FusionBundle,
  FusionWave,
  FusionWaveId,
} from './types';
import { buildCommandCatalog } from './command-catalog';
import { topPriorityWaves, computePriorityHeatmap } from './priority-matrix';

export interface FusionWindow {
  readonly id: string;
  readonly index: number;
  readonly startAt: string;
  readonly endAt: string;
  readonly activeBundleId?: string;
  readonly availableWaveIds: readonly FusionWaveId[];
}

export interface BundleSchedule {
  readonly bundleId: string;
  readonly windows: readonly FusionWindow[];
  readonly rankedWaveIds: readonly FusionWaveId[];
  readonly criticalWaveIds: readonly FusionWaveId[];
  readonly commandDensity: number;
  readonly diagnostics: readonly string[];
}

const windowMinutes = (start: string, end: string): number => {
  const startDate = Date.parse(start);
  const endDate = Date.parse(end);
  if (!Number.isFinite(startDate) || !Number.isFinite(endDate) || endDate <= startDate) {
    return 0;
  }
  return (endDate - startDate) / 60000;
}

const toWindow = (wave: FusionWave, index: number): FusionWindow => ({
  id: `${wave.id}-window`,
  index,
  startAt: wave.windowStart,
  endAt: wave.windowEnd,
  activeBundleId: wave.planId,
  availableWaveIds: [wave.id],
});

const normalizeWindow = (window: FusionWindow): FusionWindow => {
  if (windowMinutes(window.startAt, window.endAt) <= 0) {
    const start = new Date(window.startAt);
    const end = new Date(start.getTime() + 5 * 60_000);
    return {
      ...window,
      endAt: end.toISOString(),
    };
  }
  return window;
};

const isWaveHealthy = (wave: FusionWave): boolean => wave.commands.length > 0 && wave.readinessSignals.length <= 100;

const buildDiagnostics = (waves: readonly FusionWave[], ranked: readonly FusionWaveId[]): string[] => {
  const diagnostics: string[] = [];
  if (waves.length === 0) diagnostics.push('no-waves');
  if (ranked.length !== waves.length) diagnostics.push('ranking-mismatch');
  if (waves.some((wave) => !isWaveHealthy(wave))) diagnostics.push('unhealthy-waves');
  return diagnostics;
};

export const scheduleBundle = (bundle: FusionBundle): Result<BundleSchedule, Error> => {
  const catalog = buildCommandCatalog(bundle);
  const matrix = computePriorityHeatmap(bundle.waves, {
    tenant: 'global',
    maxCommands: 3,
    minWaveScore: 0.25,
    minSignalConfidence: 0.2,
  });
  const ranked = topPriorityWaves(matrix).map((entry) => entry.waveId);
  const windows = bundle.waves
    .filter(isWaveHealthy)
    .map(toWindow)
    .map((window, index) => normalizeWindow({ ...window, index }))
    .filter((window) => window.availableWaveIds.length > 0);

  const criticalWaveIds = ranked.slice(0, Math.min(3, ranked.length));
  const commandDensity = windows.length > 0
    ? catalog.totalSignals === 0 ? 0 : catalog.totalSignals / windows.length
    : 0;

  const diagnostics = buildDiagnostics(bundle.waves, ranked);
  if (windows.length === 0) {
    return fail(new Error('bundle-not-schedulable'));
  }

  return ok({
    bundleId: bundle.id,
    windows,
    rankedWaveIds: ranked,
    criticalWaveIds,
    commandDensity,
    diagnostics,
  });
};

export const rescheduleWindow = (
  bundle: FusionBundle,
  activeWindowId: string,
): Result<readonly FusionWindow[], Error> => {
  const schedule = scheduleBundle(bundle);
  if (!schedule.ok) return fail(schedule.error);
  if (!schedule.value.windows.some((window) => window.id === activeWindowId)) {
    return fail(new Error('window-not-found'));
  }

  const shifted = schedule.value.windows.map((window) => {
    if (window.id !== activeWindowId) return window;
    const start = Date.parse(window.startAt);
    const shift = 15 * 60_000;
    const nextStart = Number.isFinite(start) ? new Date(start + shift).toISOString() : window.startAt;
    const nextEnd = Number.isFinite(start) ? new Date(start + shift + 5 * 60_000).toISOString() : window.endAt;
    return { ...window, startAt: nextStart, endAt: nextEnd };
  });

  return ok(shifted);
};
