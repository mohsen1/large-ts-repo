import type { Brand, NoInfer } from '@shared/type-level';
import type {
  ForecastEnvelope,
  RecoveryTimeline,
  RecoveryTimelineEvent,
  RecoveryTimelineSegment,
  TimelineState,
  TimelinePhase,
} from './types';

export type TimelineEventCode<T extends string> = `${T & string}:${string}`;

export type EventBrand<T extends string> = Brand<string, `event-${T}`>;

export type TimelineBrand<T extends string> = Brand<string, `timeline-${T}`>;

export type DSLIdentifier<T extends string> = Brand<TimelineEventCode<T>, 'timeline-dsl-key'>;

export type TemplateLiteralPath<T extends string> =
  T extends `${infer Head}.${infer Tail}`
    ? [Head, ...TemplateLiteralPath<Tail>]
    : [T];

export interface DSLFieldSpec<TField extends string = string, TType = unknown> {
  readonly field: TField;
  readonly type: TType;
  readonly required: boolean;
  readonly example?: string;
}

export type RequiredFields<T extends Record<string, DSLFieldSpec>> = {
  [K in keyof T as T[K]['required'] extends true ? K : never]: T[K];
};

export type Optionalized<T extends Record<string, DSLFieldSpec>> = {
  [K in keyof T as T[K]['required'] extends false ? K : never]?: T[K]['type'];
};

export type ExtractPath<T, TPrefix extends string = ''> = {
  [K in keyof T & string]:
    T[K] extends Record<string, unknown>
      ? `${TPrefix}${K}` | ExtractPath<T[K], `${TPrefix}${K}.`>
      : `${TPrefix}${K}`;
}[keyof T & string];

export type RecursiveSequence<T extends readonly unknown[]> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? [NoInfer<Head>, ...RecursiveSequence<Tail>]
  : [];

export interface TimelineInstruction<
  TName extends string,
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
> {
  readonly name: TName;
  readonly input: TInput;
  readonly output: TOutput;
  readonly tags: readonly Readonly<`tag:${string}`>[];
  readonly sequence: readonly DSLIdentifier<TName>[];
}

export type InstructionMap<
  T extends readonly TimelineInstruction<string, Record<string, unknown>, Record<string, unknown>>[],
> = {
  [I in T[number] as I['name']]: I;
};

export interface TimelineDslSchema<
  TTimelineId extends string,
  TInstructionSet extends readonly TimelineInstruction<string, Record<string, unknown>, Record<string, unknown>>[],
> {
  readonly timelineId: TimelineBrand<TTimelineId>;
  readonly namespace: `recovery/${TTimelineId}`;
  readonly instructions: TInstructionSet;
  readonly policy: {
    readonly requireFreshState: boolean;
    readonly maxRisk: number;
    readonly includeSegments: boolean;
  };
}

export type InferInstructionOutput<
  TSchema extends TimelineDslSchema<string, readonly any[]>,
  TName extends keyof InstructionMap<TSchema['instructions']>,
> = InstructionMap<TSchema['instructions']>[TName]['output'];

export type InferInstructionInput<
  TSchema extends TimelineDslSchema<string, readonly any[]>,
  TName extends keyof InstructionMap<TSchema['instructions']>,
> = InstructionMap<TSchema['instructions']>[TName]['input'];

export interface TimelinePluginIntent<
  TNamespace extends string,
  TOperation extends string,
  TInput extends object = object,
> {
  readonly namespace: TNamespace;
  readonly operation: `timeline/${TOperation}`;
  readonly template: TemplateLiteralPath<TInput & string>;
  readonly payload: TInput;
}

export interface TimelineRuntimeRoute<TStepName extends string = string> {
  readonly route: `/${TStepName}`;
  readonly routeArgs: readonly string[];
}

export interface TimelineDslExecutionState {
  readonly instructionCount: number;
  readonly lastInstruction: string | null;
  readonly active: boolean;
}

export interface TimelineOrchestrationPlan {
  readonly id: EventBrand<'plan-id'>;
  readonly steps: readonly string[];
  readonly riskWindow: readonly [number, number];
  readonly statePath: string[];
}

export interface TimelineDslExecutionInput {
  readonly timeline: RecoveryTimeline;
  readonly forecast?: ForecastEnvelope;
  readonly state: TimelineState;
  readonly segments: RecoveryTimelineSegment[];
}

export interface TimelineDslExecutionOutput {
  readonly timelineId: TimelineBrand<'id'>;
  readonly nextInstructions: readonly TimelineInstruction<string, Record<string, unknown>, Record<string, unknown>>[];
  readonly events: readonly RecoveryTimelineEvent[];
}

export function parseTemplatePath(template: string): string[] {
  return template
    .split('.')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function asDslIdentifier<TName extends string>(name: TName): DSLIdentifier<TName> {
  const stamp = `${Date.now()}`.padStart(12, '0');
  return `${name}:${stamp}` as unknown as DSLIdentifier<TName>;
}

export function templatePathsMatch(base: string, candidate: string): boolean {
  const baseParts = parseTemplatePath(base);
  const candidateParts = parseTemplatePath(candidate);
  if (baseParts.length !== candidateParts.length) {
    return false;
  }
  return baseParts.every((part, index) => {
    const candidatePart = candidateParts[index];
    if (candidatePart === undefined) {
      return false;
    }
    return part === candidatePart || (part.startsWith('{') && part.endsWith('}'));
  });
}

export function createInstruction<TName extends string>(
  name: TName,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): TimelineInstruction<TName, Record<string, unknown>, Record<string, unknown>> {
  return {
    name,
    input,
    output,
    tags: ['tag:dynamic', 'tag:timeline'],
    sequence: [asDslIdentifier(name)],
  };
}

export interface TimelineDslExecutionIntent {
  readonly phase: TimelinePhase;
  readonly events: readonly RecoveryTimelineEvent[];
  readonly route: TimelineRuntimeRoute<string>;
}

export function evaluateIntent(input: TimelineDslExecutionIntent): TimelineDslExecutionState {
  const events = [...input.events];
  const riskScore = events.length === 0 ? 0 : Math.round(events.reduce((acc, value) => acc + value.riskScore, 0) / events.length);
  const isBlocked = events.some((event) => event.state === 'blocked');
  return {
    instructionCount: events.length,
    lastInstruction: events.at(-1)?.id ?? null,
    active: input.phase === 'prepare' || input.phase === 'mitigate' || input.phase === 'restore' || isBlocked || riskScore > 40,
  };
}

export function createPlanFromTimeline(timeline: RecoveryTimeline): TimelineOrchestrationPlan {
  const steps = timeline.events
    .filter((event) => event.state !== 'completed')
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((event) => event.id);
  const sortedRisk = [...timeline.events]
    .map((event) => event.riskScore)
    .sort((a, b) => b - a);
  return {
    id: `plan-${timeline.id}` as EventBrand<'plan-id'>,
    steps,
    riskWindow: [sortedRisk.at(-1) ?? 0, sortedRisk[0] ?? 0],
    statePath: timeline.events.map((event) => event.phase),
  };
}

export function normalizePhases(phases: readonly TimelinePhase[]): readonly TimelinePhase[] {
  const canonical: TimelinePhase[] = ['prepare', 'mitigate', 'restore', 'verify', 'stabilize'];
  const hasUnknown = phases.some((phase) => !canonical.includes(phase));
  if (hasUnknown) {
    return canonical;
  }
  return [...phases];
}
