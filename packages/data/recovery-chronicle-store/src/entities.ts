import { z } from 'zod';
import { asReadonly, type ReadonlyDeep } from '@shared/core';
import {
  asChroniclePlanId,
  asChronicleRoute,
  asChronicleTag,
  makePlanId,
  makeRunId,
  makeTenantId,
  validateScenario,
  ChronicleBlueprint,
  ChronicleContext,
  ChronicleId,
  ChronicleObservation,
  ChroniclePhase,
  ChroniclePlanId,
  ChronicleRunId,
  ChronicleRoute,
  ChronicleScenario,
  ChronicleTenantId,
} from '@domain/recovery-chronicle-core';

export interface ChronicleEnvelopeRecord {
  readonly id: ChronicleId;
  readonly scenarioId: ChroniclePlanId;
  readonly runId: ChronicleRunId;
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly payload: ChronicleObservation;
  readonly createdAt: number;
}

export interface ChronicleRecordSet<TPayload = unknown> {
  readonly id: ChronicleId;
  readonly scenario: ChronicleScenario;
  readonly context: ChronicleContext;
  readonly payload: TPayload;
  readonly phases: readonly ChroniclePhase<string>[];
}

export interface ChronicleSnapshotRecord {
  readonly id: ChroniclePlanId;
  readonly blueprint: ChronicleBlueprint;
  readonly latestRun: ChronicleRunId;
  readonly totalEvents: number;
  readonly updatedAt: number;
}

const baseSeed = {
  tenant: 'seed',
  route: 'chronicle://seed',
  title: 'Seed scenario',
  priority: 'p1' as const,
  expectedMaxDurationMs: 900,
} as const;

const seedManifest: ChronicleBlueprint = {
  name: baseSeed.title,
  description: 'seed manifest',
  tenant: makeTenantId(baseSeed.tenant),
  route: asChronicleRoute(baseSeed.route),
  tags: [asChronicleTag('seed')],
  plan: makePlanId(makeTenantId(baseSeed.tenant), asChronicleRoute(baseSeed.route)),
  phases: [],
  edges: [],
};

export const resolveSeedScenario = (): ChronicleScenario => {
  const validated = validateScenario(baseSeed);
  if (!validated) {
    return {
      id: makePlanId(makeTenantId(baseSeed.tenant), asChronicleRoute(baseSeed.route)),
      title: baseSeed.title,
      tenant: makeTenantId(baseSeed.tenant),
      route: asChronicleRoute(baseSeed.route),
      priority: baseSeed.priority,
      expectedMaxDurationMs: baseSeed.expectedMaxDurationMs,
      axes: {
        'axis.throughput': 0.8,
        'axis.resilience': 0.7,
        'axis.observability': 0.2,
        'axis.compliance': 0.4,
        'axis.cost': 0.1,
        'axis.operational': 0.9,
      },
      manifest: seedManifest,
    };
  }

  return {
    ...validated,
    manifest: {
      ...validated.manifest,
      tags: validated.manifest.tags.length === 0 ? [asChronicleTag('seed')] : validated.manifest.tags,
    },
  };
};

export const seededScenario = resolveSeedScenario();

export const scenarioEnvelopeSchema = z.object({
  tenant: z.string(),
  route: z.string().min(8),
  title: z.string().min(3),
  payload: z.unknown(),
});

export const normalizeSnapshot = <T>(value: T): ReadonlyDeep<T> => asReadonly(value);

export const buildEnvelope = (input: {
  payload: ChronicleObservation;
  runId: ChronicleRunId;
  scenarioId: ChroniclePlanId;
  tenant: ChronicleTenantId | string;
  route: ChronicleRoute | string;
}): {
  readonly ok: true;
  readonly value: ChronicleEnvelopeRecord;
} | {
  readonly ok: false;
  readonly error: Error;
} => {
  if (!input.tenant || !input.route || !input.payload) {
    return { ok: false, error: new Error('invalid envelope input') };
  }

  return {
    ok: true,
    value: {
      id: `${input.scenarioId}:${input.runId}` as ChronicleId,
      scenarioId: input.scenarioId,
      runId: input.runId,
      tenant: makeTenantId(input.tenant),
      route: asChronicleRoute(input.route),
      payload: input.payload,
      createdAt: Date.now(),
    },
  };
};

export const normalizeToRecordSet = <TPayload>(params: {
  scenario: ChronicleScenario;
  context: ChronicleContext;
  payload: TPayload;
}): ChronicleRecordSet<TPayload> => ({
  id: `${params.scenario.id}:${params.context.runId}` as ChronicleId,
  scenario: params.scenario,
  context: params.context,
  payload: params.payload,
  phases: ['phase:bootstrap', 'phase:discovery', 'phase:cleanup'],
});

export const hydrateScenario = (input: unknown): ChronicleScenario | undefined => {
  const parsed = scenarioEnvelopeSchema.safeParse(input);
  if (!parsed.success) return undefined;

  const tenant = makeTenantId(parsed.data.tenant);
  const route = asChronicleRoute(parsed.data.route);
  const id = asChroniclePlanId(tenant, route);
  return {
    id,
    tenant,
    route,
    title: parsed.data.title,
    priority: 'p0',
    expectedMaxDurationMs: 1200,
    axes: {
      'axis.throughput': 1,
      'axis.resilience': 1,
      'axis.observability': 1,
      'axis.compliance': 0.4,
      'axis.cost': 0.2,
      'axis.operational': 0.5,
    },
    manifest: {
      name: parsed.data.title,
      description: 'hydrated scenario',
      tenant,
      route,
      tags: [asChronicleTag('hydrated')],
      plan: id,
      phases: [],
      edges: [],
    },
  };
};

export const snapshotName = (scenario: ChronicleScenario): string =>
  `${scenario.route}::${scenario.id}` as const;

export const makeRunEnvelopeId = (scenario: ChronicleScenario): ChronicleRunId => makeRunId(scenario.id);

export const isExpired = (record: ChronicleSnapshotRecord, now = Date.now()): boolean =>
  now - record.updatedAt > 60_000;
