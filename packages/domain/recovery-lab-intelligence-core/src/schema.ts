import { z } from 'zod';
import type {
  StrategyMode,
  StrategyLane,
  SignalSource,
  SeverityBand,
  StrategyStep,
  StrategyPlan,
  StrategyResult,
  StrategyTuple,
  SessionId,
  RunId,
  PlanId,
  WorkspaceId,
  ScenarioId,
  PluginId,
  PluginFingerprint,
  SessionRoute,
  SignalEvent,
} from './types';

export const signalSourceSchema = z.enum(['telemetry', 'intent', 'policy', 'orchestration', 'manual']);
export const severitySchema = z.enum(['info', 'warn', 'error', 'critical', 'fatal']);
export const strategyModeSchema = z.enum(['simulate', 'analyze', 'stress', 'plan', 'synthesize']);
export const strategyLaneSchema = z.enum(['forecast', 'resilience', 'containment', 'recovery', 'assurance']);

const brandidSchema = z
  .string()
  .min(1)
  .transform((value: string) => value as PluginId);

const sessionIdSchema = z
  .string()
  .min(1)
  .transform((value: string) => value as SessionId);

const runIdSchema = z
  .string()
  .min(1)
  .transform((value: string) => value as RunId);

const planIdSchema = z
  .string()
  .min(1)
  .transform((value: string) => value as PlanId);

const workspaceIdSchema = z
  .string()
  .min(1)
  .transform((value: string) => value as WorkspaceId);

const scenarioIdSchema = z
  .string()
  .min(1)
  .transform((value: string) => value as ScenarioId);

export const eventSchema = z.object({
  source: signalSourceSchema,
  severity: severitySchema,
  at: z.string().datetime(),
  detail: z.record(z.unknown()),
});

const routeSchema = z
  .string()
  .refine(
    (value) => /^(simulate|analyze|stress|plan|synthesize)\/.+$/.test(value),
    {
      message: 'expected route "{mode}/{name}"',
    },
  )
  .transform((value): SessionRoute => value as SessionRoute);

export const strategyStepSchema = z.object({
  stepId: brandidSchema,
  index: z.number().int().min(0),
  plugin: brandidSchema,
  lane: strategyLaneSchema,
  mode: strategyModeSchema,
  inputs: z.record(z.unknown()),
  output: z.record(z.unknown()),
  trace: z.object({
    route: routeSchema,
    attempts: z.number().int().min(0),
    fingerprint: z
      .string()
      .transform((value: string) => value as PluginFingerprint),
  }),
});

export const strategyPlanSchema = z.object({
  planId: planIdSchema,
  sessionId: sessionIdSchema,
  workspace: workspaceIdSchema,
  scenario: scenarioIdSchema,
  title: z.string().min(1),
  lanes: z.array(strategyLaneSchema).min(1),
  steps: z.array(strategyStepSchema),
  metadata: z.record(z.unknown()).transform((metadata) => ({
    __schema: 'recovery-lab-intelligence-core::validated' as const,
    ...metadata,
  })),
});

export const strategyResultSchema = z.object({
  runId: runIdSchema,
  sessionId: sessionIdSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  mode: strategyModeSchema,
  scenario: scenarioIdSchema,
  score: z.number().min(0).max(1),
  output: z.record(z.unknown()),
  warnings: z.array(eventSchema),
  events: z.array(eventSchema),
});

export const strategyTupleSchema = z.tuple([
  strategyModeSchema,
  strategyLaneSchema,
  z.string().min(1),
  z.number().int().positive().max(9),
]);

export const strategyEnvelopeSchema = z.object({
  workspace: workspaceIdSchema,
  scenario: scenarioIdSchema,
  seed: z.record(z.unknown()),
  mode: strategyModeSchema,
  lane: strategyLaneSchema,
  plan: strategyPlanSchema,
  result: strategyResultSchema,
});

export const strategyModeListSchema = z.array(strategyModeSchema);
export const strategyLaneListSchema = z.array(strategyLaneSchema);

export const parseStrategyStep = (value: unknown): StrategyStep => strategyStepSchema.parse(value);
export const parseStrategyPlan = (value: unknown): StrategyPlan => strategyPlanSchema.parse(value);
export const parseStrategyResult = (value: unknown): StrategyResult => strategyResultSchema.parse(value);
export const parseStrategyTuple = (value: unknown): StrategyTuple => strategyTupleSchema.parse(value);

export const parseSignalEvent = (value: unknown): SignalEvent => eventSchema.parse(value);

export const isSignalSource = (source: string): source is SignalSource => signalSourceSchema.safeParse(source).success;
export const isSeverityBand = (value: string): value is SeverityBand => severitySchema.safeParse(value).success;

const supportedModes = strategyModeListSchema.parse(['simulate', 'analyze', 'stress', 'plan', 'synthesize']);
const supportedLanes = strategyLaneListSchema.parse(['forecast', 'resilience', 'containment', 'recovery', 'assurance']);

export const resolveMode = (mode: string, fallback: StrategyMode = 'simulate'): StrategyMode =>
  supportedModes.includes(mode as StrategyMode) ? (mode as StrategyMode) : fallback;

export const resolveLane = (lane: string, fallback: StrategyLane = 'forecast'): StrategyLane =>
  supportedLanes.includes(lane as StrategyLane) ? (lane as StrategyLane) : fallback;

export const signalProjection = (
  tuple: StrategyTuple,
): {
  mode: StrategyMode;
  lane: StrategyLane;
  source: string;
  risk: number;
} => {
  const [mode, lane, source, risk] = tuple;
  return {
    mode,
    lane,
    source,
    risk,
  };
};
