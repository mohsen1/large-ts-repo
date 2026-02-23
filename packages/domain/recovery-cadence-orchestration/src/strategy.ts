import type {
  CadenceConstraint,
  CadenceIntent,
  CadencePlan,
  CadenceWindow,
  CadenceWindowId,
  CadenceId,
} from './types';
import { deriveCadenceId } from './scheduler';

export interface CadenceStrategyInput {
  readonly organizationId: string;
  readonly owner: string;
  readonly channel: string;
  readonly requestedWindowCount: number;
  readonly maxConcurrentWindows: number;
  readonly intensity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CadenceConstraintBundle {
  readonly planId: CadencePlan['id'];
  readonly constraints: readonly CadenceConstraint[];
}

export interface CadenceWindowDraft {
  readonly id: CadenceWindowId;
  readonly channel: CadenceWindow['channel'];
  readonly name: string;
  readonly owner: string;
  readonly durationMinutes: number;
  readonly startAt: string;
  readonly intensity: CadenceWindow['intensity'];
}

export interface CadencePlanBlueprint {
  readonly cadenceId: CadenceId;
  readonly planId: CadencePlan['id'];
  readonly draftWindows: readonly CadenceWindowDraft[];
  readonly intentSeed: readonly CadenceIntent[];
  readonly constraints: readonly CadenceConstraint[];
  readonly notes: readonly string[];
}

const clampWindowCount = (requestedWindowCount: number): number => {
  if (requestedWindowCount <= 0) return 1;
  if (requestedWindowCount > 48) return 48;
  return requestedWindowCount;
};

const intensityLeadMinutes = (intensity: CadenceStrategyInput['intensity']): number => {
  if (intensity === 'critical') return 60;
  if (intensity === 'high') return 45;
  if (intensity === 'medium') return 30;
  return 20;
};

const intensityLagMinutes = (intensity: CadenceStrategyInput['intensity']): number => {
  if (intensity === 'critical') return 15;
  if (intensity === 'high') return 10;
  if (intensity === 'medium') return 8;
  return 5;
};

export const buildPlanDraft = (input: CadenceStrategyInput): CadencePlanBlueprint => {
  const windowCount = clampWindowCount(input.requestedWindowCount);
  const cadenceId = deriveCadenceId(`${input.organizationId}-${Date.now()}`);
  const planId = `${cadenceId}::plan` as CadencePlan['id'];

  const baseStart = Date.now();
  const leadMinutes = intensityLeadMinutes(input.intensity);
  const lagMinutes = intensityLagMinutes(input.intensity);

  const draftWindows: CadenceWindowDraft[] = Array.from({ length: windowCount }, (_, index) => {
    const offset = index * 30;
    const baseName = `window-${index + 1}`;
    const start = new Date(baseStart + offset * 60 * 1000).toISOString();
    const draftId = `${planId}-w-${index + 1}` as CadenceWindowId;

    return {
      id: draftId,
      channel: input.channel as CadenceWindow['channel'],
      name: `${input.owner}-${baseName}`,
      owner: input.owner,
      durationMinutes: leadMinutes + lagMinutes + ((index % 7) + 1),
      startAt: start,
      intensity: input.intensity,
    };
  });

  const intentSeed: CadenceIntent[] = draftWindows
    .filter((window, index) => index % 3 === 0)
    .map((window, index) => ({
      id: `${planId}-intent-${index + 1}` as CadenceIntent['id'],
      planId,
      requestedAt: new Date().toISOString(),
      requestedBy: input.owner,
      requestedWindowId: window.id,
      rationale: `Auto-generated intent for ${window.name}`,
      expectedOutcome: 'Keep operation queue healthy during peak hours',
      urgency: input.intensity,
      metadata: {
        source: 'planner',
        cadence: cadenceId,
      },
    }));

  const constraints: CadenceConstraint[] = draftWindows.map((window) => ({
    id: `${window.id}::constraint` as CadenceConstraint['id'],
    planId,
    windowId: window.id,
    maxLeadMinutes: leadMinutes + lagMinutes,
    maxLagMinutes: lagMinutes,
    maxConcurrentWindows: Math.max(1, Math.floor(input.maxConcurrentWindows)),
    allowedChannels: [window.channel as CadenceWindow['channel']],
    forbidOverlapWithIntents: intentSeed.map((intent) => intent.id),
  }));

  const notes = [
    `Generated ${windowCount} draft windows`,
    `Lead/Lag policy set to ${leadMinutes}/${lagMinutes}`,
    `Owner ${input.owner} and channel ${input.channel}`,
    `Max concurrency ${input.maxConcurrentWindows}`,
  ];

  return {
    cadenceId,
    planId,
    draftWindows,
    intentSeed,
    constraints,
    notes,
  };
};

export const enrichNotes = (existing: readonly string[], details: ReadonlyArray<string>): readonly string[] => {
  return [...existing, ...details.map((detail, index) => `${index + 1}. ${detail}`)];
};

export const clampIntensity = (intensity: CadenceStrategyInput['intensity']): CadenceStrategyInput['intensity'] => {
  if (intensity === 'critical' || intensity === 'high' || intensity === 'medium' || intensity === 'low') {
    return intensity;
  }
  return 'medium';
};
