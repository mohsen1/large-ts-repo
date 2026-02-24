import { z } from 'zod';
import {
  asChronicleChannel,
  asChroniclePlanId,
  asChroniclePhase,
  asChronicleRoute,
  asChronicleTag,
  asChronicleTenantId,
  ChronicleAxis,
  ChronicleContext,
  ChroniclePhase,
  ChroniclePluginDescriptor,
  ChronicleRoute,
  ChronicleScenario,
  ChronicleTenantId,
  ChroniclePlanId,
  buildBlueprint,
  type BlueprintFactoryInput,
} from '@domain/recovery-chronicle-core';
import { ChronicleRepository, createPlanIdFromInput } from '@data/recovery-chronicle-store';
import { fail, ok, type Result } from '@shared/result';
import { NoInfer } from '@shared/type-level';

export interface AdapterConfig {
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly limit: number;
  readonly phases: readonly ChroniclePhase<string>[];
}

export interface AdapterResult {
  readonly adapterId: string;
  readonly initializedAt: number;
  readonly route: ChronicleRoute;
}

export interface OrchestratorAdapter {
  bootstrap(): Promise<Result<AdapterResult>>;
  publish<T>(event: T): Promise<Result<boolean>>;
  getContext(planId: ChroniclePlanId): Promise<Result<ChronicleContext | undefined>>;
  teardown(): Promise<void>;
}

const adapterSchema = z.object({
  tenant: z.string(),
  route: z.string(),
  limit: z.number().int().nonnegative().max(5000),
  phases: z.array(z.string()),
});

const axisForPhase = (phase: ChroniclePhase<string>): ChronicleAxis => `axis.${phase.slice(6)}` as ChronicleAxis;

const dedupe = <T>(values: readonly T[]): T[] => [...new Set(values)];

export class ChronicleConnector {
  readonly #repository: ChronicleRepository;
  readonly #adapterId: string;

  public constructor(public readonly config: AdapterConfig) {
    this.#repository = new ChronicleRepository();
    this.#adapterId = `${config.tenant}:${config.route}`;
  }

  public get repository(): ChronicleRepository {
    return this.#repository;
  }

  public async describe(): Promise<Result<AdapterResult>> {
    const parsed = adapterSchema.parse(this.config);
    return ok({
      adapterId: this.#adapterId,
      initializedAt: Date.now(),
      route: asChronicleRoute(parsed.route),
    });
  }

  public async resolveAxes(): Promise<readonly ChronicleAxis[]> {
    const records = await this.#repository.listByTenant(this.config.tenant);
    const phases = records
      .map((record) => record.payload.phase)
      .filter((phase): phase is ChroniclePhase<string> => typeof phase === 'string' && phase.startsWith('phase:'));
    return dedupe(phases.map(axisForPhase));
  }

  public get adapterId(): string {
    return this.#adapterId;
  }
}

export class ChroniclePluginAdapter implements OrchestratorAdapter {
  readonly #connector: ChronicleConnector;
  readonly #runCache = new Map<ChroniclePlanId, ChronicleContext>();

  public constructor(connector: ChronicleConnector) {
    this.#connector = connector;
  }

  public bootstrap(): Promise<Result<AdapterResult>> {
    return this.#connector.describe();
  }

  public async publish<T>(event: T): Promise<Result<boolean>> {
    return event == null ? fail(new Error('invalid event'), 'invalid-event') : ok(true);
  }

  public async getContext(planId: ChroniclePlanId): Promise<Result<ChronicleContext | undefined>> {
    const cached = this.#runCache.get(planId);
    if (cached) return ok(cached);

    const snapshot = await this.#connector.repository.snapshot(planId);
    if (!snapshot) return ok(undefined);

    const phases = await this.#connector.repository.collectPhases(this.#connector.config.tenant);
    const context: ChronicleContext = {
      tenant: snapshot.blueprint.tenant,
      runId: snapshot.latestRun,
      plan: snapshot.id,
      route: snapshot.blueprint.route,
      state: { phases },
      priorities: ['p0', 'p1', 'p2', 'p3'],
      timeline: [asChronicleTag('runtime'), asChronicleChannel(snapshot.blueprint.route), 'control'],
    };

    this.#runCache.set(planId, context);
    return ok(context);
  }

  public async teardown(): Promise<void> {
    this.#runCache.clear();
  }
}

export interface PluginBundle {
  readonly plugins: readonly ChroniclePluginDescriptor[];
  readonly enabled: readonly string[];
}

const template: BlueprintFactoryInput['template'] = [
  { phaseName: 'bootstrap', lane: 'control', label: 'Bootstrap', weight: 1 },
  { phaseName: 'discover', lane: 'signal', label: 'Discover', weight: 1 },
  { phaseName: 'simulate', lane: 'policy', label: 'Simulate', weight: 1 },
  { phaseName: 'verify', lane: 'control', label: 'Verify', weight: 1 },
];

export const buildAdapter = (input: {
  tenant: ChronicleTenantId;
  route: ChronicleRoute;
  limit?: number;
}): ChroniclePluginAdapter => {
  return new ChroniclePluginAdapter(
    new ChronicleConnector({
      tenant: input.tenant,
      route: input.route,
      limit: input.limit ?? 1_500,
      phases: ['phase:bootstrap', 'phase:execution', 'phase:verification'],
    }),
  );
};

export const composeBlueprintScenario = (
  tenant: ChronicleTenantId,
  planName: string,
  route: ChronicleRoute,
  tags: readonly string[] = ['tag:default'],
): ChronicleScenario => {
  const manifest = buildBlueprint({
    tenant,
    title: planName,
    route,
    tags,
    planId: createPlanIdFromInput(tenant, route),
    template,
  });

  return {
    id: manifest.plan,
    tenant,
    title: planName,
    route,
    priority: 'p1',
    expectedMaxDurationMs: 1200,
    axes: {
      'axis.throughput': 1,
      'axis.resilience': 1,
      'axis.observability': 1,
      'axis.compliance': 0.4,
      'axis.cost': 0.1,
      'axis.operational': 0.7,
    },
    manifest,
  };
};

export const withPluginBundle = <T>(
  bundle: NoInfer<PluginBundle>,
  fallback: (plugins: readonly ChroniclePluginDescriptor[]) => T,
): T => {
  const active = bundle.plugins.filter((plugin) => bundle.enabled.includes(plugin.id));
  return fallback(active);
};
