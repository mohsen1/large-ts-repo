import { horizonBrand } from '@domain/recovery-horizon-engine';
import type {
  HorizonSignal,
  PluginStage,
  TimeMs,
  RunId,
  PlanId,
  PluginConfig,
  JsonLike,
  Milliseconds,
  HorizonInput,
} from '@domain/recovery-horizon-engine';

type BrandedRunId = RunId;

type SeedPayload = {
  readonly id: string;
  readonly kind: PluginStage;
  readonly payload: {
    readonly severity: 'low' | 'medium' | 'high';
    readonly source: string;
  };
  readonly input: {
    readonly version: string;
    readonly runId: BrandedRunId;
    readonly tenantId: string;
    readonly stage: PluginStage;
    readonly tags: readonly string[];
    readonly metadata: { readonly source: string };
  };
  readonly severity: 'low' | 'medium' | 'high';
  readonly startedAt: string;
  readonly expiresAt: TimeMs;
};

const toMs = (value: number): TimeMs => value as TimeMs;
const toRetries = (value: number): Milliseconds<number> => value as Milliseconds<number>;

const seedPayloads: readonly SeedPayload[] = [
  {
    id: 'seed-plan-baseline',
    kind: 'ingest',
    payload: {
      severity: 'low',
      source: 'seed',
    },
    input: {
      version: '1.0.0',
      runId: horizonBrand.fromRunId('seed-run-001'),
      tenantId: 'tenant-001',
      stage: 'ingest',
      tags: ['seed', 'default'],
      metadata: { source: 'bootstrap' },
    },
    severity: 'low',
    startedAt: new Date().toISOString(),
    expiresAt: toMs(Date.now()),
  },
  {
    id: 'seed-plan-stability',
    kind: 'analyze',
    payload: {
      severity: 'medium',
      source: 'seed',
    },
    input: {
      version: '1.0.0',
      runId: horizonBrand.fromRunId('seed-run-002'),
      tenantId: 'tenant-001',
      stage: 'analyze',
      tags: ['seed', 'default'],
      metadata: { source: 'bootstrap' },
    },
    severity: 'medium',
    startedAt: new Date().toISOString(),
    expiresAt: toMs(Date.now()),
  },
];

const normalizeRetryWindow = (ms: number): Milliseconds<number> => toRetries(ms);

const toConfig = (
  kind: PluginStage,
  seed: SeedPayload,
): PluginConfig<PluginStage, JsonLike> => ({
  pluginKind: kind,
  payload: {
    seed: true,
    retry: normalizeRetryWindow(500),
    source: seed.input.tenantId,
  },
  retryWindowMs: normalizeRetryWindow(350),
});

export const bootstrapPayloads: readonly HorizonSignal<PluginStage, JsonLike>[] = seedPayloads.map((seed) => ({
  id: horizonBrand.fromPlanId(seed.id),
  kind: seed.kind,
  payload: {
    ...seed.payload,
    config: toConfig(seed.kind, seed),
  },
  input: {
    ...seed.input,
    runId: seed.input.runId,
  },
  severity: seed.severity,
  startedAt: horizonBrand.fromDate(seed.startedAt),
  expiresAt: seed.expiresAt,
}));

export const seedContractConfigs = seedPayloads.map((seed) => toConfig(seed.kind, seed));
