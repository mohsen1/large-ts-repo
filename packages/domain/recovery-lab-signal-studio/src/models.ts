import type { Brand } from '@shared/type-level';
import type {
  PluginCatalog,
  PluginExecutionInput,
  PluginExecutionOutput,
  PluginContract,
  PluginStage,
} from '@shared/lab-simulation-kernel';
import { createCatalogSummary, type StageMap, makeWindow } from '@shared/lab-simulation-kernel';

export type TenantId = Brand<string, 'TenantId'>;
export type ScenarioId = Brand<string, 'ScenarioId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type RunId = Brand<string, 'RunId'>;
export type SignalPayload = Brand<Record<string, unknown>, 'SignalPayload'>;

export interface SignalWindow {
  readonly from: number;
  readonly to: number;
  readonly samples: readonly number[];
}

export interface SignalBundle {
  readonly tenant: TenantId;
  readonly workspace: WorkspaceId;
  readonly scenario: ScenarioId;
  readonly runId: RunId;
  readonly windows: readonly SignalWindow[];
}

export interface SignalPluginResult {
  readonly plugin: string;
  readonly stage: PluginStage;
  readonly score: number;
}

export interface PlannerInput {
  readonly tenant: TenantId;
  readonly workspace: WorkspaceId;
  readonly scenario: ScenarioId;
}

export interface PluginRunEnvelope<T extends PluginCatalog> {
  readonly plan: string;
  readonly catalog: T;
  readonly input: PluginExecutionInput<unknown>;
  readonly outputs: PluginExecutionOutput<SignalPluginResult>[];
}

export const normalizeWindows = (windows: readonly SignalWindow[]): SignalWindow[] => {
  return windows.toSorted((left, right) => left.from - right.from);
};

export const buildWindowSignature = (windows: readonly SignalWindow[]): string => {
  return windows
    .map((window) => `${window.from}:${window.to}:${window.samples.join(',')}`)
    .join(' | ');
};

export const mapPayload = <T extends { plugin: string; stage: PluginStage }>(value: T): string => {
  return `${value.plugin}@${value.stage}`;
};

export const summarizePlugins = (catalog: PluginCatalog): StageMap => {
  return createCatalogSummary(catalog).buckets;
};

export interface SignalStudioPlan {
  readonly scenario: ScenarioId;
  readonly steps: readonly string[];
  readonly confidence: number;
}

export const buildPlanFingerprint = (plan: SignalStudioPlan): string => `${plan.scenario}::${plan.steps.length}::${plan.confidence}`;

export type WindowSamples<T extends readonly number[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head & number, ...WindowSamples<Tail & readonly number[]>]
  : readonly [];

export type PluginWindowMap<T extends PluginCatalog> = {
  [K in T[number] as K['name']]: PluginExecutionOutput<unknown>[];
};

export const defaultStudioWindows = normalizeWindows([
  { from: 0, to: 30, samples: [0.1, 0.3] },
  { from: 30, to: 60, samples: [0.7, 0.4, 0.2] },
]);

export const inferWindowScore = (window: SignalWindow): number =>
  window.samples.reduce((acc, value) => acc + value, 0) / Math.max(1, window.samples.length);

export const windowTuple = <T extends number[]>(values: T): WindowSamples<T> => values as unknown as WindowSamples<T>;

export const bootstrapWindow = makeWindow(0, 0, [inferWindowScore({ from: 0, to: 1, samples: [1] })]);

export const createCatalog = <T extends PluginCatalog>(catalog: T): T => catalog;

export const ensurePluginResult = <T extends PluginExecutionOutput<unknown>>(
  output: PluginExecutionOutput<unknown>,
): output is T => {
  return output.payload !== undefined;
};

export interface AdapterSignalBundle {
  readonly tenant: TenantId;
  readonly scenario: ScenarioId;
  readonly runId: RunId;
  readonly events: readonly string[];
}
