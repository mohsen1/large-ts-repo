import type {
  OrchestratorInput,
  OrchestratorReport,
  StageRoute,
  WorkloadTopology,
  RecoverySignal,
  TenantId,
} from '@domain/recovery-stress-lab';
import { createTenantId } from '@domain/recovery-stress-lab';
import { createSeedRunbookId, runOnce } from '@domain/recovery-stress-lab';

export interface RuntimeManifest {
  readonly tenantId: TenantId;
  readonly name: string;
  readonly version: string;
  readonly readyAt: string;
}

export interface RecoveryLabClientHandle {
  readonly tenantId: TenantId;
  readonly manifest: RuntimeManifest;
  readonly client: RecoveryStressLabClient;
}

const defaultManifest: RuntimeManifest = {
  tenantId: createTenantId('tenant-a'),
  name: 'recovery-stress-lab-runner',
  version: '1.0.0',
  readyAt: new Date().toISOString(),
};

const sanitizeRoute = (route: StageRoute<`stress/${string}`>): StageRoute<`stress/${string}`> => {
  const filtered = route.filter(Boolean);
  if (filtered.length < 2) {
    return ['stress', 'bootstrap'];
  }
  return [filtered[0]!, filtered[1]!] as StageRoute<`stress/${string}`>;
};

const normalizeSignals = (signals: readonly RecoverySignal[]): readonly RecoverySignal[] => {
  return [...signals].toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
};

const normalizeTopology = (topology: WorkloadTopology): WorkloadTopology => {
  return {
    ...topology,
    tenantId: topology.tenantId || defaultManifest.tenantId,
    nodes: [...topology.nodes].toSorted((left, right) => left.name.localeCompare(right.name)),
    edges: [...topology.edges].toSorted((left, right) => left.from.localeCompare(right.from)),
  };
};

export interface StressLabRunInput {
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly runbookIds: readonly string[];
  readonly band: 'low' | 'medium' | 'high' | 'critical';
  readonly stages?: StageRoute<`stress/${string}`>;
}

export interface StressLabRunOutcome {
  readonly report: OrchestratorReport;
  readonly manifest: RuntimeManifest;
  readonly seedRunbookId: ReturnType<typeof createSeedRunbookId>;
}

export class RecoveryStressLabClient {
  #tenantId: TenantId;

  public constructor(tenantId: TenantId) {
    this.#tenantId = tenantId;
  }

  public async run(input: StressLabRunInput): Promise<OrchestratorReport> {
    const topology = normalizeTopology(input.topology);
    const signals = normalizeSignals(input.signals);
    const stages = sanitizeRoute(input.stages ?? (['stress', 'bootstrap'] as const));
    return runOnce(this.#tenantId, topology, signals, input.runbookIds, stages, input.band);
  }

  public async runWithMetadata(input: StressLabRunInput): Promise<StressLabRunOutcome> {
    const report = await this.run(input);
    const seedRunbookId = createSeedRunbookId(this.#tenantId);

    return {
      report,
      manifest: defaultManifest,
      seedRunbookId,
    };
  }
}

export const createRecoveryStressLabClient = async (tenantId: TenantId): Promise<RecoveryLabClientHandle> => {
  const manifest = {
    ...defaultManifest,
    tenantId,
    readyAt: new Date().toISOString(),
  };

  return {
    tenantId,
    manifest,
    client: new RecoveryStressLabClient(tenantId),
  };
};

export const hydrateOrchestratorInput = (payload: OrchestratorInput): OrchestratorInput => {
  const stages = sanitizeRoute(payload.stages);
  return {
    ...payload,
    stages,
  };
};

export const runtimeManifest = defaultManifest;
