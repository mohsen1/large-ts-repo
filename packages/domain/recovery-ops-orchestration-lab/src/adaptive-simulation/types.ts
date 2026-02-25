import { z } from 'zod';
import type {
  Brand,
  DeepReadonly,
  KeyPaths,
  PathValue,
} from '@shared/type-level';

export type SimulationSessionId = Brand<string, 'SimulationSessionId'>;
export type SimulationPlanId = Brand<string, 'SimulationPlanId'>;
export type SimulationRunId = Brand<string, 'SimulationRunId'>;
export type SimulationNodeId = Brand<string, 'SimulationNodeId'>;
export type SimulationSignalId = Brand<string, 'SimulationSignalId'>;
export type SimulationPluginId = Brand<string, 'SimulationPluginId'>;

export type SimulationPhase =
  | 'discover'
  | 'shape'
  | 'simulate'
  | 'validate'
  | 'recommend'
  | 'execute'
  | 'verify'
  | 'close';

export type SimulationTopology = 'grid' | 'mesh' | 'chain' | 'ring';
export type SimulationHealth = 'ok' | 'degraded' | 'failed' | 'recovering';
export type SimulationSignalTier = 'signal' | 'warning' | 'critical' | 'postmortem';
export type PluginKind<TName extends string = string> = `recovery/ops/sim/${TName}`;
export type TemplateTag<TKind extends string> = `${TKind}:template`;
export type StageLabel<TPhase extends SimulationPhase = SimulationPhase> = `${TPhase}::${string}`;
export type TaggedPlan<TTopology extends SimulationTopology = SimulationTopology> = {
  readonly kind: `topology:${TTopology}`;
  readonly tags: readonly string[];
};
export type TopologyBySignalCount = {
  readonly count: number;
  readonly topology: SimulationTopology;
};

export interface SimulationTag {
  readonly key: string;
  readonly value: string;
}

export interface SimulationInput {
  readonly tenantId: string;
  readonly siteId: string;
  readonly zone: string;
  readonly severityBudget: number;
  readonly requestedBy: string;
}

export interface SimulationWindow {
  readonly id: SimulationSessionId;
  readonly from: string;
  readonly to: string;
  readonly timezone: string;
  readonly blackoutMinutes: readonly number[];
}

export interface SimulationSignal {
  readonly id: SimulationSignalId;
  readonly namespace: string;
  readonly tier: SimulationSignalTier;
  readonly title: string;
  readonly score: number;
  readonly confidence: number;
  readonly tags: readonly SimulationTag[];
}

export interface SimulationStep {
  readonly id: SimulationPlanId;
  readonly name: string;
  readonly kind: PluginKind<string>;
  readonly command: string;
  readonly durationMinutes: number;
  readonly dependsOn: readonly SimulationPlanId[];
  readonly weight: number;
  readonly reversible: boolean;
  readonly tags: readonly string[];
}

export interface SimulationPlan {
  readonly id: SimulationPlanId;
  readonly title: string;
  readonly sessionId: SimulationSessionId;
  readonly confidence: number;
  readonly state: 'draft' | 'active' | 'candidate' | 'blocked';
  readonly steps: readonly SimulationStep[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SimulationEnvelopeInput {
  readonly sessionId: SimulationSessionId;
  readonly plan: SimulationPlan;
  readonly signals: readonly SimulationSignal[];
  readonly windows: readonly SimulationWindow[];
  readonly topology: SimulationTopology;
  readonly metadata: DeepReadonly<Record<string, unknown>>;
}

export interface SimulationSummary {
  readonly sessionId: SimulationSessionId;
  readonly signalCount: number;
  readonly criticalCount: number;
  readonly riskIndex: number;
  readonly health: SimulationHealth;
}

export interface SimulationEnvelope<TContext extends object = object> {
  readonly id: SimulationSessionId;
  readonly runId: SimulationRunId;
  readonly phase: SimulationPhase;
  readonly createdAt: string;
  readonly envelope: SimulationEnvelopeInput;
  readonly context: DeepReadonly<TContext>;
  readonly summary: SimulationSummary;
}

export interface SimulationPluginOutput<TPayload = unknown> {
  readonly pluginId: SimulationPluginId;
  readonly phase: SimulationPhase;
  readonly timestamp: string;
  readonly elapsedMs: number;
  readonly payload: DeepReadonly<TPayload>;
}

export interface SimulationCandidate<T = object> {
  readonly id: SimulationPlanId;
  readonly score: number;
  readonly topology: SimulationTopology;
  readonly rationale: string;
  readonly metadata: DeepReadonly<T>;
}

export interface SimulationResult<TPayload = object, TContext extends object = object> {
  readonly sessionId: SimulationSessionId;
  readonly runId: SimulationRunId;
  readonly output: DeepReadonly<TPayload>;
  readonly context: DeepReadonly<TContext>;
  readonly candidates: readonly SimulationCandidate[];
  readonly selectedPlanId?: SimulationPlanId;
  readonly diagnostics: readonly string[];
  readonly summary: SimulationSummary;
}

export type SimulationOutput<TPayload = object, TContext extends object = object> = SimulationResult<TPayload, TContext>;

export interface SessionExecutionContext {
  readonly namespace: string;
  readonly runId: SimulationRunId;
}

export type SimulationSignalPath<TSignal extends SimulationSignal> = KeyPaths<TSignal>;
export type SimulationTagValue<TPayload> = {
  [Key in keyof TPayload as Key extends `_${string}` ? never : Key]: TPayload[Key];
};

export type SimulationRunMetadata<TVersion extends string = string> = {
  readonly schemaVersion: TVersion;
  readonly namespace: string;
  readonly correlationId: Brand<string, 'CorrelationId'>;
  readonly buildTag: TemplateTag<`v${TVersion}`>;
};

export type SimulationConfig<TInput extends object = object, TOutput = object> = {
  readonly sessionId: SimulationSessionId;
  readonly input: SimulationInput;
  readonly topology: SimulationTopology;
  readonly phaseSequence: readonly SimulationPhase[];
  readonly plugins: readonly { readonly kind: PluginKind<string>; readonly version: string }[];
  readonly expectedOutput: TOutput;
  readonly inputSnapshot: TInput;
};

export const simulationPhaseSchema = z.enum([
  'discover',
  'shape',
  'simulate',
  'validate',
  'recommend',
  'execute',
  'verify',
  'close',
]);

export const simulationSignalTierSchema = z.enum(['signal', 'warning', 'critical', 'postmortem']);

export const asSessionId = (value: string): SimulationSessionId => value as SimulationSessionId;
export const asPlanId = (value: string): SimulationPlanId => value as SimulationPlanId;
export const asRunId = (value: string): SimulationRunId => value as SimulationRunId;
export const asPluginId = (value: string): SimulationPluginId => value as SimulationPluginId;
export const asNodeId = (value: string): SimulationNodeId => value as SimulationNodeId;

const ensureNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export const normalizeTopology = (value: string): SimulationTopology =>
  value === 'mesh' || value === 'chain' || value === 'ring' || value === 'grid' ? value : 'grid';

export const riskFromSignals = (signals: readonly SimulationSignal[]): number => {
  const critical = signals.filter((signal) => signal.tier === 'critical').length;
  const warning = signals.filter((signal) => signal.tier === 'warning').length;
  const base = Math.max(signals.length, 1);
  return (critical * 1.8 + warning * 0.9 + signals.length * 0.15) / base;
};

export const signalScore = (signal: SimulationSignal): number =>
  ensureNumber(signal.score) + ensureNumber(signal.confidence) * 60;

export const resolveHealth = (risk: number): SimulationHealth =>
  risk > 1.4 ? 'failed' : risk > 1.1 ? 'degraded' : risk > 0.9 ? 'recovering' : 'ok';

export const buildSummary = (envelope: Pick<SimulationEnvelopeInput, 'sessionId' | 'signals'>): SimulationSummary => {
  const risk = riskFromSignals(envelope.signals);
  return {
    sessionId: envelope.sessionId,
    signalCount: envelope.signals.length,
    criticalCount: envelope.signals.filter((signal) => signal.tier === 'critical').length,
    riskIndex: risk,
    health: resolveHealth(risk),
  };
};

export const buildSimulationEnvelope = <TContext extends object>(
  input: SimulationEnvelopeInput,
  context: TContext,
  phase: SimulationPhase = 'discover',
): SimulationEnvelope<TContext> => ({
  id: input.sessionId,
  runId: asRunId(`${input.sessionId}:${Date.now()}`),
  phase,
  createdAt: new Date().toISOString(),
  envelope: input,
  context: context as DeepReadonly<TContext>,
  summary: buildSummary(input),
});

export const buildSignalFingerprint = (signals: readonly SimulationSignal[]): string =>
  signals
    .toSorted((left, right) => left.tier.localeCompare(right.tier))
    .map((signal) => `${signal.id}::${signal.tier}::${signal.score.toFixed(2)}`)
    .join('|');

export type RebasedTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? [Head, ...RebasedTuple<Tail>]
    : [];

export type ExtractedPath<T, TPath extends string> = TPath extends keyof T & string
  ? T[TPath]
  : PathValue<T, TPath>;

export const buildPlanFingerprint = <TOutput extends object>(
  envelope: SimulationEnvelope<TOutput>,
  candidates: number,
): string => `${buildSignalFingerprint(envelope.envelope.signals)}::${candidates}:${envelope.summary.health}`;

export const normalizeTopologyMap = (topologies: readonly SimulationTopology[]): TopologyBySignalCount => ({
  count: topologies.length,
  topology: normalizeTopology(topologies[topologies.length - 1] ?? 'grid'),
});

export const parseTopology = <TInput extends string>(value: TInput): TopologyBySignalCount & TaggedPlan => {
  const normalized = normalizeTopology(value) as SimulationTopology;
  return {
    count: value.length,
    topology: normalized,
    kind: `topology:${normalized}` as const,
    tags: [value.length > 0 ? `raw:${value}` : 'raw:empty', `normalized:${normalized}`],
  } satisfies TopologyBySignalCount & TaggedPlan;
};

export const describeSignal = (signal: SimulationSignal): `${SimulationSignalTier}:${string}` => `${signal.tier}:${signal.id}`;

