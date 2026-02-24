import { z } from 'zod';
import type { Brand } from '@shared/core';
import {
  asLabPluginId,
  asLabRunId,
  asLabScenarioId,
  asLabTenantId,
  type LabPluginId,
  type LabRunId,
  type LabScenarioId,
  type LabTenantId,
} from '@shared/recovery-lab-kernel';
import type { NoInfer, Merge, DeepMerge } from '@shared/type-level';

export const severityScale = ['low', 'medium', 'high', 'critical'] as const satisfies readonly string[];

type Severity = (typeof severityScale)[number];

export type LabKind = 'disaster' | 'degradation' | 'security' | 'compliance' | 'capacity';
export type LabLane = 'ingest' | 'simulate' | 'verify' | 'restore' | 'report';

export interface ScenarioSignal {
  readonly name: string;
  readonly lane: LabLane;
  readonly severity: Severity;
  readonly value: number;
  readonly createdAt: string;
}

export type LabSignal = ScenarioSignal;

export interface StepOutput {
  readonly message: string;
  readonly status: 'ok' | 'warning' | 'blocked';
  readonly score: number;
  readonly signalDelta: number;
}

export interface LabScenario {
  readonly tenant: LabTenantId;
  readonly scenarioId: LabScenarioId;
  readonly lane: LabLane;
  readonly kind: LabKind;
  readonly labels: readonly string[];
  readonly objective: string;
  readonly signals: readonly ScenarioSignal[];
}

export interface LabPlanTemplate {
  readonly tenant: LabTenantId;
  readonly scenarioId: LabScenarioId;
  readonly stepIds: readonly string[];
  readonly expectedMs: number;
  readonly requires: readonly Brand<string, 'ScenarioId'>[];
  readonly canary: boolean;
}

export interface LabExecution {
  readonly executionId: LabRunId;
  readonly tenant: LabTenantId;
  readonly scenarioId: LabScenarioId;
  readonly pluginIds: readonly LabPluginId[];
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly lane: LabLane;
}

export interface LabTelemetry {
  readonly runId: LabRunId;
  readonly tenant: string;
  readonly events: number;
  readonly metrics: Record<string, number>;
  readonly emitted: readonly string[];
}

export interface LabExecutionContext {
  readonly tenant: LabTenantId;
  readonly traceId: string;
  readonly runId: LabRunId;
  readonly initiatedBy: string;
  readonly startedAt: number;
  readonly workspace: string;
}

export interface LabExecutionResult {
  readonly context: LabExecutionContext;
  readonly execution: LabExecution;
  readonly steps: readonly StepOutput[];
  readonly health: number;
  readonly status: 'running' | 'passed' | 'failed' | 'cancelled';
  readonly telemetry: LabTelemetry;
}

export type RuntimeSignalBag<TSignals extends readonly ScenarioSignal[]> = {
  readonly [K in TSignals[number] as K['name'] & string]: K['value'];
};

export type StepPath<T extends string> = T extends `${infer _A}/${infer _B}` ? string : never;

export type RoutePayload<TShape extends Record<string, unknown>> = {
  readonly route: {
    readonly [K in keyof TShape as `route:${Extract<K, string>}`]: TShape[K];
  };
};

export type FlattenRoutePayload<TShape extends Record<string, unknown>> =
  RoutePayload<TShape>['route'];

export interface PluginInputEnvelope<TInput extends Record<string, unknown>> {
  readonly input: TInput;
  readonly lane: LabLane;
}

export interface PluginOutputEnvelope<TOutput extends Record<string, unknown>> {
  readonly output: TOutput;
  readonly quality: number;
  readonly issues: readonly string[];
}

export interface ScenarioPlan<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>> {
  readonly id: LabScenarioId;
  readonly lane: LabLane;
  readonly input: TInput;
  readonly output: TOutput;
}

export interface BuildPlanContext {
  readonly tenant: LabTenantId;
  readonly scenarioId: LabScenarioId;
  readonly dryRun: boolean;
  readonly seed: number;
}

export interface PlanStep<TInput, TOutput> {
  readonly id: string;
  readonly pluginId: LabPluginId;
  readonly input: TInput;
  readonly output: TOutput;
  readonly meta: {
    readonly weight: number;
    readonly order: number;
  };
}

export type PlanRoute<TSteps extends readonly PlanStep<any, any>[]> = {
  readonly scenarioId: string;
  readonly labels: {
    readonly [K in TSteps[number] as K['id']]: K['meta']['order'];
  };
};

export type UnionToTuple<T extends unknown> =
  [T] extends [never]
    ? []
    : T extends infer Item
      ? readonly [Item, ...UnionToTuple<Exclude<T, Item>>]
      : never;

export type NormalizeStep<T extends readonly string[]> = T extends readonly [infer Head, ...infer Tail]
  ? Tail extends readonly string[]
    ? readonly [
        Head & string,
        ...NormalizeStep<Tail>
      ]
    : readonly [Head & string]
  : readonly [];

export interface RunCatalog {
  readonly tenant: LabTenantId;
  readonly scenarios: readonly LabScenario[];
  readonly plans: readonly LabPlanTemplate[];
}

export type RunCatalogShape<TCatalog extends RunCatalog> = {
  readonly [K in keyof TRawCatalog]: TRawCatalog[K];
};

type TRawCatalog = {
  scenarioCount: number;
  stepCount: number;
};

export const LabSignalSchema = z.object({
  name: z.string().min(3),
  lane: z.enum(['ingest', 'simulate', 'verify', 'restore', 'report']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  value: z.number().min(0).max(100),
  createdAt: z.string().datetime(),
});

export const LabScenarioSchema = z.object({
  tenant: z.string().min(3),
  scenarioId: z.string().min(4),
  lane: z.enum(['ingest', 'simulate', 'verify', 'restore', 'report']),
  kind: z.enum(['disaster', 'degradation', 'security', 'compliance', 'capacity']),
  labels: z.array(z.string()),
  objective: z.string().min(4),
  signals: z.array(LabSignalSchema).min(1),
});

export type LabScenarioShape = z.infer<typeof LabScenarioSchema>;

export const transformScenarioShape = (input: LabScenarioShape): LabScenario => ({
  tenant: asLabTenantId(input.tenant),
  scenarioId: asLabScenarioId(input.scenarioId),
  lane: input.lane,
  kind: input.kind,
  labels: input.labels,
  objective: input.objective,
  signals: input.signals,
});

export const buildExecution = (tenant: string, scenarioId: string, lane: LabLane): LabExecution => ({
  executionId: asLabRunId(`${tenant}-${scenarioId}-${Date.now()}`),
  tenant: asLabTenantId(tenant),
  scenarioId: asLabScenarioId(scenarioId),
  pluginIds: [asLabPluginId(`${tenant}-${scenarioId}-ingest`)],
  startedAt: new Date().toISOString(),
  lane,
});

export const mergeContext = <
  TBase extends { tenant: LabTenantId; lane: LabLane },
  TPatch extends Partial<{ tenant: LabTenantId; lane: LabLane }>,
>(base: NoInfer<TBase>, patch: NoInfer<TPatch>): DeepMerge<TBase, TPatch> => {
  return {
    ...base,
    ...patch,
    tenant: patch.tenant ?? base.tenant,
    lane: patch.lane ?? base.lane,
  } as DeepMerge<TBase, TPatch>;
};

export type PlanMerge<TLeft, TRight> = Merge<TLeft, TRight>;
