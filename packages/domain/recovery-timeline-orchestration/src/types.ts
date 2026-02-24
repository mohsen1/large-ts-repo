import {
  Brand,
  type OmitNever,
  type PluginTrace,
  type RecursiveTupleKeys,
} from '@shared/type-level';
import {
  classifyRisk,
  createPlanFromTimeline,
  type RecoveryTelemetrySnapshot,
  type RecoveryTimeline,
  type RecoveryTimelineEvent,
  type TimelinePhase,
} from '@domain/recovery-timeline';
import { z } from 'zod';

export type ConductorMode = 'observe' | 'simulate' | 'stabilize';
export type ConductorProfile = 'predictive' | 'adaptive' | 'forensic';
export type ConductorNamespace = `conductor-${ConductorMode}`;

export type ConductorId<TMode extends ConductorMode = ConductorMode> = Brand<
  `timeline-conductor:${TMode}:${string}`,
  `conductor-${TMode}`
>;

export type TimelineConductorTemplate<T extends string> = `${T}::conductor`;

export type SignalPath<T extends string> = T extends `${infer Head}.${infer Tail}`
  ? readonly [Head, ...SignalPath<Tail>]
  : readonly [T];

export type RiskGradient = readonly [low: number, medium: number, high: number];

export interface ConductorMetricSample {
  readonly timelineId: string;
  readonly phase: TimelinePhase;
  readonly score: number;
  readonly band: RiskBand;
  readonly at: number;
}

export interface TimelineConductorState<TTimelineId extends string, TMode extends ConductorMode = ConductorMode> {
  readonly id: ConductorId<TMode>;
  readonly timelineId: TTimelineId;
  readonly mode: TMode;
  readonly phase: TimelinePhase;
  readonly samples: readonly ConductorMetricSample[];
  readonly confidence: number;
  readonly tags: readonly Brand<string, 'conductor-tag'>[];
}

export type PhaseWindow<T extends readonly TimelinePhase[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? readonly [Head & TimelinePhase, ...PhaseWindow<Tail & readonly TimelinePhase[]>]
    : readonly [];

export type MetricBuckets<TProfile extends string[]> = {
  [K in TProfile[number]]: number;
};

export interface ConductorInput {
  readonly seedTimeline: RecoveryTimeline;
  readonly mode: ConductorMode;
  readonly plugins: readonly string[];
  readonly pluginNames: readonly string[];
  readonly windowMinutes: number;
  readonly profile: ConductorProfile;
}

export interface ConductorOutput {
  readonly id: ConductorId;
  readonly timelineId: string;
  readonly mode: ConductorMode;
  readonly riskProfile: MetricBuckets<['low', 'medium', 'high', 'critical']>;
  readonly timelineWindow: readonly number[];
  readonly nextSteps: readonly string[];
  readonly snapshot: RecoveryTelemetrySnapshot;
}

export interface ConductorPolicyResult {
  readonly accepted: boolean;
  readonly reason: string;
  readonly overrides: Readonly<Record<string, unknown>>;
}

export interface ConductorPolicy<TProfile extends ConductorProfile> {
  readonly profile: TProfile;
  readonly minConfidence: number;
  readonly sampleWindow: number;
  readonly allowPartial: boolean;
}

export type ConductorResult<TOutput> =
  | ({ readonly ok: true; readonly output: TOutput })
  | ({ readonly ok: false; readonly error: Error });

export const conductorPhases = {
  ingest: 'ingest',
  enrich: 'enrich',
  simulate: 'simulate',
  validate: 'validate',
  resolve: 'resolve',
} as const;

export type ConductorTemplate = typeof conductorPhases;
export type TemplateName = keyof ConductorTemplate;

export type TimelineConductorTemplateKey<T extends string> =
  {
    [K in TemplateName]: TimelineConductorTemplate<`${T}/${K}`>;
  }[TemplateName];

export interface PluginRunRecord {
  readonly pluginId: Brand<string, 'plugin'>;
  readonly trace: PluginTrace;
  readonly durationMs: number;
}

export type PluginRunCatalog = readonly PluginRunRecord[];

export interface PluginProfileEntry {
  readonly namespace: string;
  readonly pluginId: string;
  readonly weight: number;
}

export function createConductorId<TMode extends ConductorMode>(mode: TMode): ConductorId<TMode> {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `timeline-conductor:${mode}:${stamp}` as ConductorId<TMode>;
}

export function toSignalPath<T extends string>(input: T): SignalPath<T> {
  const parts = input.split('.');
  return parts.map((part) => part.trim()) as unknown as SignalPath<T>;
}

const RiskGradientTupleSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
]);

const ConductorMetricSampleSchema = z.object({
  timelineId: z.string().min(1),
  phase: z.enum(['prepare', 'mitigate', 'restore', 'verify', 'stabilize']),
  score: z.number().min(0).max(100),
  band: z.enum(['low', 'medium', 'high', 'critical']),
  at: z.number().min(0),
});

export const ConductorInputSchema = z.object({
  timelineId: z.string().min(1),
  mode: z.enum(['observe', 'simulate', 'stabilize']),
  pluginNames: z.array(z.string()),
  windowMinutes: z.number().positive(),
  profile: z.enum(['predictive', 'adaptive', 'forensic']),
});

export const ConductorPolicySchema = z.object({
  profile: z.enum(['predictive', 'adaptive', 'forensic']),
  minConfidence: z.number().min(0).max(1),
  sampleWindow: z.number().positive(),
  allowPartial: z.boolean(),
});

export type ConductorInputPayload = z.infer<typeof ConductorInputSchema>;
export type ConductorPolicyPayload = z.infer<typeof ConductorPolicySchema>;
export type MetricSamplePayload = z.infer<typeof ConductorMetricSampleSchema>;

export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

export function classifySamples(events: readonly RecoveryTimelineEvent[]): readonly ConductorMetricSample[] {
  return events.map((event) => ({
    timelineId: event.timelineId,
    phase: event.phase,
    score: event.riskScore,
    band: classifyRisk(event.riskScore),
    at: event.start.getTime(),
  }));
}

export function deriveRiskBuckets(
  samples: readonly ConductorMetricSample[],
): OmitNever<MetricBuckets<['low', 'medium', 'high', 'critical']>> {
  const bucket = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  } satisfies MetricBuckets<['low', 'medium', 'high', 'critical']>;

  for (const sample of samples) {
    bucket[sample.band] += sample.score;
  }

  return bucket as OmitNever<MetricBuckets<['low', 'medium', 'high', 'critical']>>;
}

export function mapTuples<T extends readonly unknown[]>(tuples: T): RecursiveTupleKeys<T> {
  return tuples as unknown as RecursiveTupleKeys<T>;
}

export function buildState(seed: RecoveryTimeline, mode: ConductorMode): TimelineConductorState<string, ConductorMode> {
  const plan = createPlanFromTimeline(seed);
  const samples = classifySamples(seed.events);
  const confidence = samples.length > 0
    ? samples.reduce((acc, item) => acc + item.score, 0) / (samples.length * 100)
    : 0;

  return {
    id: createConductorId(mode),
    timelineId: seed.id,
    mode,
    phase: (plan.statePath[0] ?? 'prepare') as TimelinePhase,
    samples,
    confidence,
    tags: plan.steps.map((step) => `step:${step}` as Brand<string, 'conductor-tag'>),
  };
}
