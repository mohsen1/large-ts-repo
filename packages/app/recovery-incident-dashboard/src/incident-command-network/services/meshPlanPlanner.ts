import type { PlanWindow, RuntimeIntent, CommandNetworkSnapshot, CommandWave } from '@domain/recovery-command-network';
import { computeSchedulingWindow, summarizeWindow } from '@domain/recovery-command-network';

export interface MeshTimelinePoint {
  readonly at: string;
  readonly label: string;
  readonly load: number;
  readonly urgencyScore: number;
}

export interface MeshPlanDraft {
  readonly timestamp: string;
  readonly windows: readonly PlanWindow[];
  readonly intentCount: number;
  readonly totalCommands: number;
  readonly waves: readonly CommandWave[];
}

const parseWindowScore = (window: PlanWindow): number => {
  if (window.runbooks.length === 0) {
    return 0.4;
  }
  const runbooks = window.runbooks.length;
  const minutes = Math.max(1, (Date.parse(window.toUtc) - Date.parse(window.fromUtc)) / 60000);
  const base = Math.min(1, runbooks / minutes);
  return Math.max(0.1, Math.min(1, base + window.notes.length * 0.15));
};

export const buildDraftWindows = (snapshot: CommandNetworkSnapshot, intents: readonly RuntimeIntent[]): MeshPlanDraft => {
  const windows = snapshot.policies
    .flatMap((policy) => {
      if (!policy) {
        return [];
      }
      const baselineWindow: PlanWindow = {
        windowId: `${snapshot.networkId}-${policy.policyId}` as any,
        fromUtc: new Date(Date.now()).toISOString(),
        toUtc: new Date(Date.now() + 40 * 60_000).toISOString(),
        runbooks: [],
        expectedDurationMinutes: 60,
        notes: ['auto-generated'],
      };
      return [baselineWindow];
    });

  const schedule = computeSchedulingWindow(intents, snapshot.policies);
  const waves = intents.flatMap((intent) => intent.waves);
  const totalCommands = waves.reduce((sum, wave) => sum + wave.commandCount, 0);

  return {
    timestamp: new Date().toISOString(),
    windows,
    intentCount: intents.length,
    totalCommands,
    waves,
  };
};

export const projectTimeline = (snapshot: CommandNetworkSnapshot, draft: MeshPlanDraft): readonly MeshTimelinePoint[] => {
  const points: MeshTimelinePoint[] = [];
  const totalWindows = draft.windows.length;

  for (let index = 0; index < totalWindows; index += 1) {
    const window = draft.windows[index];
    const score = parseWindowScore(window);
    const label = summarizeWindow(window);
    const load = Number((score * (1 + snapshot.policies.length / 12)).toFixed(2));
    points.push({
      at: window.fromUtc,
      label,
      load,
      urgencyScore: Math.max(0.1, Math.min(1, load - (index * 0.08))),
    });
  }

  return points;
};

export const evaluateDraft = (draft: MeshPlanDraft, limitSeconds: number) => {
  const maxLoad = draft.windows.length ? Math.max(...projectTimeline({} as any, draft).map((entry) => entry.load)) : 0;
  const withinWindow = draft.windows.every((window) => {
    const duration = Math.max(1, (Date.parse(window.toUtc) - Date.parse(window.fromUtc)) / 1000);
    return duration <= limitSeconds;
  });

  return {
    total: draft.windows.length,
    maxLoad,
    accepted: withinWindow && maxLoad < 5,
    confidence: Number((1 - Math.max(0, maxLoad - 3) / 4).toFixed(2)),
  };
};
