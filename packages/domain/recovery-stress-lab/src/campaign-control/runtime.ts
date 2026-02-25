import {
  buildCampaignPlan,
  runCampaignForecast,
} from './planner';
import {
  buildCampaignSnapshot,
  buildTraceEnvelope,
  collectCampaignChunks,
  phaseHeat,
  summarizeTelemetry,
  type CampaignTelemetryChunk,
} from './telemetry';
import {
  type CampaignPlanOptions,
  type CampaignPlanResult,
  type CampaignPhase,
  CampaignTuple,
  CampaignSeed,
  createCampaignBundleId,
  createCampaignId,
  createCampaignSessionId,
  type CampaignSessionId,
} from './types';
import { campaignFixtures } from './fixtures';
import { createSignalId, type TenantId, type RecoverySignal } from '../models';
import { defaultWindowSize } from '@domain/recovery-stress-lab-intelligence';
import { type NoInfer } from '@shared/type-level';

const normalizedFixtures = campaignFixtures.toSorted((left, right) =>
  String(left.campaignId).localeCompare(String(right.campaignId)),
);

export interface CampaignWorkspace {
  readonly tenantId: TenantId;
  readonly sessionId: CampaignSessionId;
  readonly phases: readonly CampaignPhase[];
  readonly ready: boolean;
  readonly seed: CampaignSeed;
  readonly snapshotAt: string;
}

export interface CampaignRunResult {
  readonly tenantId: TenantId;
  readonly workspace: CampaignWorkspace;
  readonly plan: CampaignPlanResult;
  readonly telemetry: {
    readonly chunks: readonly CampaignTelemetryChunk[];
    readonly summary: Readonly<Record<string, number>>;
  };
  readonly forecastCount: number;
}

export interface CampaignCatalogEntry {
  readonly tenantId: TenantId;
  readonly campaignId: string;
}

const defaultPlanOptions = (tenantId: TenantId, seed: CampaignSeed): CampaignPlanOptions => ({
  tenantId,
  bundleId: createCampaignBundleId(tenantId, `runtime-${seed.campaignId}`),
  windows: seed.windows
    .slice(0, Math.min(seed.windows.length, 4))
    .map((window) => ({ ...window, durationMinutes: Math.min(window.durationMinutes, defaultWindowSize) })),
  includeVerification: true,
});

export const resolveCampaignSeed = (tenantId: TenantId, campaignId: string): CampaignSeed | undefined => {
  return normalizedFixtures.find((seed) => seed.tenantId === tenantId && String(seed.campaignId) === campaignId);
};

const buildCampaignSession = (tenantId: TenantId, campaignId: string, phase: CampaignPhase): CampaignSessionId => {
  const bundle = createCampaignBundleId(tenantId, `${campaignId}-${phase}`);
  return createCampaignSessionId(tenantId, createCampaignId(tenantId, String(bundle)));
};

const toTelemetrySignals = (tenantId: TenantId, seed: CampaignSeed): readonly RecoverySignal[] => {
  return seed.requiredSignals.map((signalId, index) => ({
    id: signalId,
    class: 'availability',
    severity: index % 3 === 0 ? 'critical' : index % 2 === 1 ? 'high' : 'low',
    title: `${seed.campaignId}:${String(signalId)}`,
    createdAt: new Date().toISOString(),
    metadata: {
      tenantId,
      campaignId: String(seed.campaignId),
      index,
    },
  }));
};

export const ensureCampaignWorkspace = (tenantId: TenantId, campaignId: string): CampaignWorkspace => {
  const seed =
    resolveCampaignSeed(tenantId, campaignId) ??
    ({
      tenantId,
      campaignId: createCampaignId(tenantId, campaignId),
      title: `fallback-${campaignId}`,
      bundleId: createCampaignBundleId(tenantId, campaignId),
      windows: [{ index: 0, durationMinutes: 20, intensity: 0.8 }],
      route: ['discovery', 'orchestration'],
      labels: ['fallback'],
      requiredSignals: [createSignalId('fallback')],
    } as CampaignSeed);

  return {
    tenantId,
    sessionId: buildCampaignSession(tenantId, campaignId, 'seed'),
    phases: ['seed', 'discovery', 'modeling', 'orchestration', 'verification'],
    ready: seed.windows.length > 0,
    seed,
    snapshotAt: new Date().toISOString(),
  };
};

export const runCampaignWorkspace = async (
  tenantId: TenantId,
  campaignId: string,
  options?: Partial<CampaignPlanOptions>,
): Promise<CampaignRunResult> => {
  const seed =
    resolveCampaignSeed(tenantId, campaignId) ??
    campaignFixtures[0] ??
    ({
      tenantId,
      campaignId: createCampaignId(tenantId, campaignId),
      title: `fallback-${campaignId}`,
      bundleId: createCampaignBundleId(tenantId, 'fallback'),
      windows: [{ index: 0, durationMinutes: 15, intensity: 0.4 }],
      route: ['seed'],
      labels: ['fallback'],
      requiredSignals: [createSignalId('fallback')],
    } as CampaignSeed);

  const planOptions: CampaignPlanOptions = {
    ...defaultPlanOptions(tenantId, seed),
    ...options,
  };

  const plan = await buildCampaignPlan(tenantId, seed, planOptions);
  const forecast = await runCampaignForecast(tenantId, seed, planOptions);
  const chunks = await collectCampaignChunks(tenantId, toTelemetrySignals(tenantId, seed));
  const envelope = buildCampaignSnapshot(
    tenantId,
    createCampaignSessionId(tenantId, seed.campaignId),
    buildTraceEnvelope(tenantId, String(plan.sessionId)).payload,
    chunks,
  );

  const summary = summarizeTelemetry(chunks);

  return {
    tenantId,
    workspace: {
      tenantId,
      sessionId: plan.sessionId,
      phases: phaseHeat(plan.phases),
      ready: plan.phases.length > 0,
      seed,
      snapshotAt: new Date().toISOString(),
    },
    plan,
    telemetry: {
      chunks,
      summary,
    },
    forecastCount: forecast.forecastCount + Object.keys(envelope.chunks).length,
  };
};

export const listCampaignCatalog = (): readonly CampaignCatalogEntry[] =>
  normalizedFixtures.map((seed) => ({ tenantId: seed.tenantId, campaignId: String(seed.campaignId) }));

export const planWithWindowLimit = async <TSignals extends readonly string[]>(
  tenantId: TenantId,
  campaignId: string,
  signals: NoInfer<TSignals>,
  limit: number,
): Promise<CampaignPlanResult> => {
  const seed =
    resolveCampaignSeed(tenantId, campaignId) ??
    campaignFixtures[0] ??
    ({
      tenantId,
      campaignId: createCampaignId(tenantId, campaignId),
      title: String(campaignId),
      bundleId: createCampaignBundleId(tenantId, String(signals.at(0) ?? 'default')),
      windows: [
        { index: 0, durationMinutes: 20, intensity: 0.5 },
        { index: 1, durationMinutes: 25, intensity: 0.7 },
      ],
      route: ['seed'],
      labels: ['runtime'],
      requiredSignals: signals.map((signal) => createSignalId(signal)),
    } as CampaignSeed);

  const planOptions: CampaignPlanOptions = {
    tenantId,
    bundleId: createCampaignBundleId(tenantId, `window-limit-${String(limit)}`),
    windows: seed.windows.slice(0, Math.max(1, limit)),
    includeVerification: signals.includes('verification' as never),
  };

  return buildCampaignPlan(tenantId, seed, planOptions);
};

export interface ForecastEnvelope {
  readonly tenantId: TenantId;
  readonly seedId: string;
}

export const buildCampaignTuple = <T>(value: T): CampaignTuple<T> => {
  const tuple: T[] = [];
  for (let index = 0; index < 24; index += 1) {
    tuple.push(value);
  }
  return tuple as unknown as CampaignTuple<T>;
};
