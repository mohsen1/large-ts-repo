import {
  buildForecastSummary,
  defaultWindowSize,
  summarizeRecommendations,
} from '@domain/recovery-stress-lab-intelligence';
import {
  buildPlanSeed,
  buildSeedFromSignals,
  createCampaignSessionId,
  type CampaignKind,
  type CampaignPlanOptions,
  type CampaignPhase,
  type CampaignPlanResult,
  type CampaignPlugin,
  type CampaignSeed,
  type CampaignSeedWindow,
  type CampaignStageTemplate,
  type CampaignTuple,
  PluginCatalogKind,
  type PluginInputOf,
  type PluginOutputOf,
  buildCampaignTrace,
  createCampaignBundleId,
  createCampaignId,
} from './types';
import {
  type StageSignal,
  type StageSignalId,
  type TenantId,
  createSignalId as createSignalIdModel,
  createStageAttemptId,
} from '../models';
import { buildCampaignRegistry } from './registry';

const resolvePhaseWeight: Record<CampaignPhase, number> = {
  seed: 1,
  discovery: 2,
  modeling: 3,
  orchestration: 4,
  simulation: 5,
  verification: 6,
  review: 7,
};

const baselinePhases = ['seed', 'discovery', 'modeling', 'orchestration', 'simulation', 'verification'] as const;

const withPhaseWeight = (phases: readonly CampaignPhase[]) =>
  [...phases].toSorted((left, right) => resolvePhaseWeight[right] - resolvePhaseWeight[left]);

const toWindowTemplate = (
  windows: readonly CampaignSeedWindow[],
  phase: CampaignPhase,
  signalId: StageSignalId,
): CampaignStageTemplate => {
  const signal = {
    id: signalId,
    class: 'availability',
    severity: 'medium',
    title: `${phase}-stage`,
    createdAt: new Date().toISOString(),
    metadata: { phase },
  } as const;

  const window = windows.at(0) ?? { index: 0, durationMinutes: 12, intensity: 0.25 };
  return {
    stage: phase,
    label: `seed:${phase}:${window.index}`,
    weight: window.durationMinutes + window.intensity,
    notes: [`phase:${phase}`, `duration:${window.durationMinutes}`],
    requiredSignals: [signal.id],
  };
};

const toRecWindow = (tenantId: TenantId, index: number): CampaignSeedWindow => ({
  index,
  durationMinutes: 6 + ((index + 3) % 7) + tenantId.length,
  intensity: Math.abs(Math.sin(index) * 0.75),
});

export const buildSeedStageMatrix = (seed: CampaignSeed): readonly CampaignStageTemplate[] => {
  const windows = [...seed.windows].toSorted((left, right) => right.intensity - left.intensity);
  const base = windows.length === 0 ? [toRecWindow(seed.tenantId, 0)] : windows;
  return baselinePhases
    .map((phase, index) =>
      toWindowTemplate(base, phase, seed.requiredSignals[index] ?? createSignalIdModel(`seed-${seed.campaignId}-${index}`)),
    )
    .filter((stage): stage is CampaignStageTemplate => stage.requiredSignals.length > 0)
    .toSorted((left, right) => resolvePhaseWeight[right.stage] - resolvePhaseWeight[left.stage]);
};

const normalizeOptions = (options: CampaignPlanOptions): CampaignPlanOptions => {
  const windows = options.windows
    .toSorted((left, right) => right.intensity - left.intensity)
    .map((window, index) => ({
      ...window,
      index,
      durationMinutes: Math.max(1, Math.min(window.durationMinutes, defaultWindowSize)),
      intensity: Math.max(0, Math.min(window.intensity, 1)),
    }));

  return {
    ...options,
    windows,
  };
};

const synthesizeAttempt = (tenantId: TenantId, seed: CampaignSeed): StageSignal => {
  const source = seed.requiredSignals[0] ?? createSignalIdModel(`seed-source-${seed.campaignId}`);
  return {
    signal: createSignalIdModel(`${tenantId}::attempt-${seed.campaignId}`) as StageSignalId,
    tenantId,
    signalClass: 'availability',
    severity: 'low',
    score: seed.windows.length,
    createdAt: Date.now(),
    source: String(source),
  };
};

const deriveForecastSignals = (seed: CampaignSeed): readonly StageSignal[] => {
  return seed.requiredSignals.map((requiredSignal, index) => ({
    tenantId: seed.tenantId,
    signal: requiredSignal,
    signalClass: 'availability',
    severity: 'low',
    score: index / 10,
    createdAt: Date.now() - index,
    source: `campaign-planner:${seed.campaignId}`,
  }));
};

const defaultTuple = (): CampaignTuple<string> => {
  const tuple: string[] = [];
  for (let index = 0; index < 24; index += 1) {
    tuple.push('seed');
  }
  return tuple as unknown as CampaignTuple<string>;
};

const forecastSignalEnvelope = (seed: CampaignSeed, tenantId: TenantId, tracePhase: CampaignPhase) => ({
    tenantId,
    route: ['seed', tracePhase],
  bundleId: createCampaignBundleId(tenantId, `forecast-${seed.campaignId}`),
  trace: buildCampaignTrace(tenantId, seed.campaignId),
});

export const buildCampaignPlan = async (
  tenantId: TenantId,
  seed: CampaignSeed,
  options: CampaignPlanOptions,
): Promise<CampaignPlanResult<readonly CampaignStageTemplate[]>> => {
  const normalizedOptions = normalizeOptions(options);
  const attemptId = createStageAttemptId(`${seed.campaignId}-attempt`);
  const attemptSeed = buildPlanSeed(
    tenantId,
    {
      id: attemptId,
      source: synthesizeAttempt(tenantId, seed).signal,
      phaseClass: 'raw',
      severityBand: 'low',
      normalizedScore: Number(attemptId.length),
    },
  );
  const syntheticSeed = buildSeedFromSignals(tenantId, attemptSeed.campaignId, []);
  const forecastSignals = deriveForecastSignals(attemptSeed);
  const summary = await buildForecastSummary(tenantId, forecastSignals);
  const recommendations = summarizeRecommendations(summary);

  const stageMatrix = buildSeedStageMatrix(syntheticSeed);
  const phaseSequence = normalizedOptions.windows
    .toSorted((left, right) => right.intensity - left.intensity)
    .map((_window, index) => {
      if (index === 0) return 'seed';
      if (index === 1) return recommendations.length % 2 === 0 ? 'discovery' : 'modeling';
      if (index === 2) return 'orchestration';
      return recommendations.length > 12 ? 'simulation' : index % 2 === 1 ? 'verification' : 'modeling';
    });

  const plan = stageMatrix.map((stage, index) =>
    buildCampaignStage(
      phaseSequence[index] ?? stage.stage,
      stage.requiredSignals[0] ?? createSignalIdModel(`${seed.campaignId}-${index}`),
      index,
      seed,
      recommendations,
    ),
  );

  return {
    phases: withPhaseWeight(Array.from(new Set(phaseSequence))),
    plan,
    sessionId: createCampaignSessionId(tenantId, syntheticSeed.campaignId),
  };
};

const buildCampaignStage = (
  phase: CampaignPhase,
  signalId: StageSignalId,
  index: number,
  seed: CampaignSeed,
  recommendations: readonly { readonly code: string }[],
): CampaignStageTemplate => {
  return {
    stage: phase,
    label: `${seed.title}:${phase}:${index}`,
    weight: 10 + (index + recommendations.length) * 0.75,
    notes: [`seed:${seed.campaignId}`, `signal:${signalId}`, `rec:${recommendations.length}`],
    requiredSignals: [signalId],
  };
};

export interface CampaignForecastRun {
  readonly seedTuple: CampaignTuple<string>;
  readonly plan: CampaignPlanResult;
  readonly forecastCount: number;
  readonly defaultSession: string;
  readonly recommendations: readonly string[];
}

export const runCampaignForecast = async (
  tenantId: TenantId,
  seed: CampaignSeed,
  options: CampaignPlanOptions,
): Promise<CampaignForecastRun> => {
  const plan = await buildCampaignPlan(tenantId, seed, options);
  const signalEnvelope = forecastSignalEnvelope(seed, tenantId, options.includeVerification ? 'verification' : 'simulation');
  const forecastSignals = plan.plan.map((stage, index) => ({
    tenantId,
    signal: createSignalIdModel(`${seed.campaignId}-${index}`),
    signalClass: 'availability' as const,
    severity: 'medium' as const,
    score: signalEnvelope.trace.route.length + index * 0.05,
    createdAt: Date.now(),
    source: String(signalEnvelope.bundleId),
  }));

  const recommendations = summarizeRecommendations(
    await buildForecastSummary(tenantId, forecastSignals.toSorted((left, right) => left.createdAt - right.createdAt)),
  ).map((recommendation) => recommendation.code);

  const defaultSession = String(createCampaignSessionId(tenantId, createCampaignId(tenantId, String(plan.sessionId))));

  return {
    seedTuple: defaultTuple(),
    plan,
    forecastCount: recommendations.length,
    defaultSession,
    recommendations,
  };
};

export const summarizeCatalogKinds = <TCatalog extends readonly CampaignPlugin[]>(
  tenantId: TenantId,
  catalog: TCatalog,
): readonly PluginCatalogKind<TCatalog>[] => {
  const registry = buildCampaignRegistry(tenantId, catalog);
  const manifest = registry.manifest();
  const keys = Object.keys(manifest);
  return keys.map((key) => key.replace(/^kind:/, '') as PluginCatalogKind<TCatalog>);
};

export const runThroughCatalogKinds = async <TCatalog extends readonly CampaignPlugin[]>(
  tenantId: TenantId,
  catalog: TCatalog,
  seed: CampaignSeed,
): Promise<{
  readonly entries: readonly {
    readonly kind: PluginCatalogKind<TCatalog>;
    readonly output: CampaignTuple<PluginOutputOf<TCatalog, PluginCatalogKind<TCatalog>>>;
  }[];
}> => {
  const catalogByKind = summarizeCatalogKinds(tenantId, catalog);
  const registry = buildCampaignRegistry(tenantId, catalog);
  const outputs = [] as {
    readonly kind: PluginCatalogKind<TCatalog>;
    readonly output: CampaignTuple<PluginOutputOf<TCatalog, PluginCatalogKind<TCatalog>>>;
  }[];
  const context = {
    tenantId,
    sessionId: createCampaignSessionId(tenantId, seed.campaignId),
    route: ['discovery', 'orchestration'],
    routeTags: ['build', 'seed'],
    requestedBy: 'planner',
  };

  for (const kind of catalogByKind) {
    const candidate = catalog.find((entry): entry is Extract<TCatalog[number], { readonly kind: typeof kind }> => entry.kind === kind);
    if (!candidate) {
      continue;
    }

    const input = (seed as unknown) as PluginInputOf<TCatalog, typeof kind>;
    const output = (await registry.run(
      kind,
      input,
      context,
      `planner-${String(kind)}`,
    )) as CampaignTuple<PluginOutputOf<TCatalog, typeof kind>>;

    outputs.push({
      kind,
      output,
    });
  }

  return { entries: outputs };
};

export type CampaignPlanTuple = CampaignTuple<CampaignKind>;
export type CampaignPlanTupleWindow = CampaignTuple<CampaignPhase>;
