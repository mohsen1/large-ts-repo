import { NoInfer } from '@shared/type-level';
import type { IncidentLabPlan, IncidentLabRun, IncidentLabSignal, LabTemplateStep } from './types';
import { type IncidentLabStudioTelemetry } from './incident-studio-types';
import { buildLaneManifestSignature, type LaneState, type LaneManifest } from './incident-studio-lanes';
import { buildPlanTimeline, type OrchestrationTimelineFrame } from './incident-studio-schedule';

export const adaptiveModes = ['conservative', 'balanced', 'aggressive'] as const;
export type AdaptiveMode = (typeof adaptiveModes)[number];

export type AdaptationState<TState extends string = string> = `adapt:${TState}`;

export type AdaptiveProfile<TInput extends readonly [string, ...string[]]> = {
  readonly profile: `profile:${TInput[0]}`;
  readonly tags: TInput;
  readonly score: number;
};

export interface AdaptationInput {
  readonly mode: AdaptiveMode;
  readonly signals: readonly IncidentLabSignal[];
  readonly plan: IncidentLabPlan;
  readonly run: IncidentLabRun;
  readonly lanes: LaneState;
}

export interface AdaptationDecision {
  readonly profile: AdaptationState<AdaptiveMode>;
  readonly plan: IncidentLabPlan;
  readonly skipStepIds: readonly string[];
  readonly score: number;
  readonly rationale: readonly string[];
}

export interface AdaptationReport {
  readonly decisions: readonly AdaptationDecision[];
  readonly timeline: readonly OrchestrationTimelineFrame[];
  readonly laneSignature: LaneManifest['signature'];
  readonly telemetry: IncidentLabStudioTelemetry;
  readonly confidence: number;
}

export const inferSignalLoad = (signals: readonly IncidentLabSignal[]): number => {
  if (signals.length === 0) return 0;
  const scores = signals.map((signal) => signal.value);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  return max === 0 ? 0 : Math.round(((max - min) / max) * 100);
};

export const adaptPlanForSignals = <TSignal extends readonly IncidentLabSignal[]>(
  input: {
    readonly mode: AdaptiveMode;
    readonly plan: IncidentLabPlan;
    readonly signals: NoInfer<TSignal>;
    readonly manifest: ReturnType<typeof buildLaneManifestSignature>;
  },
): {
  readonly decision: AdaptationDecision;
  readonly signalLoad: number;
  readonly adaptiveRunbook: readonly LabTemplateStep[];
} => {
  const signalLoad = inferSignalLoad(input.signals);
  const signalBuckets = input.signals.reduce<Record<string, number>>((acc, signal) => {
    acc[signal.kind] = (acc[signal.kind] ?? 0) + signal.value;
    return acc;
  }, {});

  const ordered = Object.entries(signalBuckets)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([kind, value]) => `${kind}:${value}`);

  const multiplier = input.mode === 'aggressive' ? 1.25 : input.mode === 'balanced' ? 1.05 : 0.9;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round((signalLoad * multiplier) + (ordered.length * 4) + input.manifest.snapshot.overload * 13),
    ),
  );
  const skips = score > 75 ? input.plan.queue.slice(0, 2) : input.plan.queue.slice(0, 0);

  const adaptiveRunbook = input.plan.queue
    .filter((step) => !skips.includes(step))
    .map((step) => ({
      id: step,
      label: `adapt:${step}`,
      command: 'noop',
      expectedDurationMinutes: 1,
      dependencies: skips.includes(step) ? [] : [step],
      constraints: [],
      owner: 'incident-lab-adapter' as unknown as LabTemplateStep['owner'],
    }));

  const decision: AdaptationDecision = {
    profile: `adapt:${input.mode}`,
    plan: {
      ...input.plan,
      queue: input.plan.queue.filter((step) => !skips.includes(step)),
      selected: input.plan.selected.filter((step) => !skips.includes(step)),
      state: score > 70 ? 'ready' : input.mode === 'aggressive' ? 'active' : 'cooldown',
    },
    skipStepIds: skips,
    score,
    rationale: [`signal-load=${signalLoad}`, ...ordered],
  };

  return {
    decision,
    signalLoad,
    adaptiveRunbook,
  };
};

export const buildAdaptivePolicy = <T extends AdaptiveMode>(
  input: {
    readonly mode: NoInfer<T>;
    readonly telemetry: IncidentLabStudioTelemetry;
    readonly signals: readonly IncidentLabSignal[];
    readonly plan: IncidentLabPlan;
    readonly run: IncidentLabRun;
  },
): AdaptationReport => {
  const payload = adaptPlanForSignals({
    mode: input.mode,
    plan: input.plan,
    signals: input.signals,
    manifest: buildLaneManifestSignature({
      updatedAt: new Date().toISOString(),
      lanes: {},
      overload: input.telemetry.warnings.length,
      reason: input.telemetry.warnings,
    }),
  });

  return {
    decisions: [payload.decision],
    timeline: buildPlanTimeline({
      plan: input.plan,
      startAt: new Date().toISOString(),
      strategy: input.mode === 'aggressive' ? 'sla-aware' : 'dependency-first',
    }, 16),
    laneSignature: buildLaneManifestSignature({
      updatedAt: new Date().toISOString(),
      lanes: {},
      overload: 0,
      reason: ['adaptive'],
    }).signature,
    telemetry: input.telemetry,
    confidence: Math.max(0, Math.min(1, payload.signalLoad / 100)),
  };
};
