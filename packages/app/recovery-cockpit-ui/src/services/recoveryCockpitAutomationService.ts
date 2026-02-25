import { Brand, NoInfer } from '@shared/type-level';
import {
  parseBlueprintFromJson,
  serializeBlueprint,
  sampleBlueprintFromText,
  type AutomationBlueprint,
  type AutomationStage,
  type PluginId,
  type StepId,
} from '@domain/recovery-cockpit-orchestration-core';
import {
  compileFromJson,
  createAutomationRuntime,
  summarizeRuntime,
  type RuntimeContext,
  type RuntimeResult,
} from '@service/recovery-cockpit-orchestrator';
import { createDefaultPoint, type SnapshotPoint, createAutomationSnapshotStore } from '@data/recovery-cockpit-store';

export type AutomationMode = 'observe' | 'dry-run' | 'execute';

export type AutomationRunPayload = {
  readonly tenant: Brand<string, 'Tenant'>;
  readonly user: string;
  readonly mode: AutomationMode;
  readonly limit: number;
};

export type AutomationRunOverview = {
  readonly id: Brand<string, 'RunId'>;
  readonly state: RuntimeResult['state'];
  readonly blueprintId: string;
  readonly totalSteps: number;
  readonly warnings: number;
};

export type DeckItem = {
  readonly stepId: StepId;
  readonly pluginId: PluginId;
  readonly stage: AutomationStage;
  readonly ready: boolean;
  readonly owner: string;
};

export type AutomationSnapshotEnvelope = {
  readonly blueprint: AutomationBlueprint;
  readonly points: readonly SnapshotPoint[];
  readonly decks: readonly DeckItem[];
};

const iteratorFrom =
  (globalThis as {
    readonly Iterator?: {
      readonly from?: <T>(value: Iterable<T>) => { toArray(): T[] };
    };
  }).Iterator?.from;

const toArray = <T>(value: Iterable<T>): T[] => iteratorFrom?.(value)?.toArray() ?? [...value];

const defaultPayload = {
  tenant: 'tenant:automation' as Brand<string, 'Tenant'>,
  user: 'system',
  mode: 'observe' as AutomationMode,
  limit: 25,
};

const runtimeContext = (payload: AutomationRunPayload): RuntimeContext => ({
  tenant: payload.tenant,
  user: payload.user,
  runId: `${payload.tenant}:${Date.now()}` as Brand<string, 'RunId'>,
});

const describeStep = (step: AutomationBlueprint['steps'][number], index: number): DeckItem => ({
  stepId: step.stepId,
  pluginId: step.plugin.pluginId,
  stage: step.plugin.stage,
  ready: step.plugin.provides.length > 0 || index % 2 === 0,
  owner: step.metadata.owner,
});

export const makeSamplePayload = (name: string): string => sampleBlueprintFromText(name);

export const hydrateBlueprintFromText = (text: string): AutomationBlueprint | undefined => {
  const parsed = parseBlueprintFromJson(text);
  if (!parsed) return undefined;
  return parsed;
};

export const buildDeck = (blueprint: AutomationBlueprint): readonly DeckItem[] =>
  toArray(blueprint.steps.map((step, index) => describeStep(step, index)));

export const compileBlueprintText = async (
  payload: string,
  tenant: Brand<string, 'Tenant'>,
): Promise<NoInfer<AutomationBlueprint> | undefined> => {
  const compiled = await compileFromJson(payload, tenant);
  if (!compiled.ok) {
    return undefined;
  }
  return compiled.value.blueprint;
};

export const runAutomationFromText = async (
  payload: string,
  overrides: Partial<AutomationRunPayload> = {},
): Promise<AutomationRunOverview | undefined> => {
  const runPayload: AutomationRunPayload = { ...defaultPayload, ...overrides };
  const compiled = await compileBlueprintText(payload, runPayload.tenant);
  if (!compiled) return undefined;

  const context = runtimeContext(runPayload);
  const runtime = createAutomationRuntime(compiled, context);
  const result = await runtime.run();
  if (!result.ok) return undefined;

  const summary = summarizeRuntime(result.value);
  return {
    id: context.runId,
    state: result.value.state,
    blueprintId: compiled.header.blueprintId,
    totalSteps: summary.totalSteps,
    warnings: summary.warnings,
  };
};

const normalizeSnapshot = (blueprint: AutomationBlueprint): AutomationSnapshotEnvelope => {
  const store = createAutomationSnapshotStore();
  const points: SnapshotPoint[] = blueprint.steps.map((step, index) =>
    createDefaultPoint(blueprint, step.stepId, {
      index,
      stage: step.plugin.stage,
    }),
  );
  void store;
  return {
    blueprint,
    points,
    decks: buildDeck(blueprint),
  };
};

export const describePayload = (payload: string): string | undefined => {
  const blueprint = hydrateBlueprintFromText(payload);
  if (!blueprint) return undefined;
  const normalized = normalizeSnapshot(blueprint);
  return serializeBlueprint(normalized.blueprint);
};

export const resolveRunConfig = (mode?: string): AutomationMode => {
  if (mode === 'execute' || mode === 'dry-run') return mode;
  return 'observe';
};

export const useAutomationService = () => ({
  runAutomationFromText,
  compileBlueprintText,
  makeSamplePayload,
  resolveRunConfig,
  describePayload,
  buildDeck,
  normalize: (payload: string) => ({
    payload,
    mode: defaultPayload.mode,
  }),
} as const);
