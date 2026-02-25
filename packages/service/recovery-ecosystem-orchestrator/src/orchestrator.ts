import { fail, ok, type Result } from '@shared/result';
import { DurableAdapter, NullAdapter, type AdapterConfig, createAdapter, asSignal } from './adapters';
import { createInMemoryStore, type EcosystemStorePort } from '@data/recovery-ecosystem-store';
import type { ServiceDependencies, OrchestratorPort } from './ports';
import {
  asTenantId,
  type RecoveryRun,
  type RunSummary,
  asRunId,
  composeNamespace,
  parseRun,
} from '@domain/recovery-ecosystem-core';
import { EcosystemEngine } from './engine';

type WorkspaceEntry = {
  readonly namespace: string;
  readonly snapshotCount: number;
  readonly active: number;
};

export interface OrchestratorRunOptions {
  readonly tenantId: string;
  readonly namespace: string;
  readonly dryRun?: boolean;
}

export interface OrchestratorResult {
  readonly run: RecoveryRun;
  readonly summary: RunSummary;
}

export interface OrchestratorHydrate {
  readonly run: RecoveryRun;
  readonly namespace: string;
  readonly events: readonly { readonly at: string; readonly event: string; readonly stage?: string }[];
  readonly snapshot?: unknown;
}

export class RecoveryEcosystemOrchestrator {
  readonly #engine: EcosystemEngine;
  readonly #store: EcosystemStorePort;
  readonly #adapter: DurableAdapter;

  public constructor(config?: Partial<AdapterConfig>) {
    this.#store = createInMemoryStore();
    this.#engine = new EcosystemEngine(this.#store);
    this.#adapter = createAdapter('ecosystem-orchestrator', config?.timeoutMs ?? 20);
  }

  public async run(input: OrchestratorRunOptions): Promise<Result<OrchestratorResult>> {
    const tenant = asTenantId(input.tenantId);
    const namespace = composeNamespace(input.namespace);
    const runResult = await this.#engine.startRun(input.tenantId, namespace);
    if (!runResult.ok) {
      return fail(runResult.error, 'start-failed');
    }

    const open = await this.#adapter.open(runResult.value.id);
    if (!open.ok || !open.value) {
      return fail(new Error('adapter-open-failed'), 'adapter');
    }

    const execution = await this.#engine.executeRun(runResult.value);
    if (!execution.ok) {
      await this.#adapter.signal(runResult.value.id, asSignal('run-failed'), {
        tenant: String(tenant),
        reason: String(execution.error),
      });
      return fail(execution.error, 'execution-failed');
    }

    await this.#adapter.signal(runResult.value.id, asSignal('run-complete'), {
      tenant: String(tenant),
      stageCount: execution.value.stages.length,
    });
    await this.#adapter.close(runResult.value.id);

    return ok({
      run: runResult.value,
      summary: execution.value,
    });
  }

  public async hydrate(runId: string): Promise<Result<OrchestratorHydrate>> {
    const normalizedRun = asRunId(runId);
    const loaded = await this.#store.loadAndHydrate(normalizedRun);
    if (!loaded.snapshot) {
      return fail(new Error('snapshot-missing'), 'hydrate');
    }
    const parsed = await this.#coerceRun(loaded.snapshot.payload);
    if (!parsed.ok) {
      return fail(parsed.error, 'hydrate');
    }

    const events = loaded.events.map((event) => ({
      at: event.at,
      event: event.event,
      stage: event.stageId,
    }));

    return ok({
      run: parsed.value,
      namespace: loaded.snapshot?.namespace ?? composeNamespace('default'),
      events,
      snapshot: loaded.snapshot,
    });
  }

  public async runWorkspace(tenantId: string): Promise<WorkspaceEntry> {
    const namespace = composeNamespace(tenantId);
    const snapshots = await this.#store.query(namespace);
    const tenant = asTenantId(tenantId);
    return {
      namespace,
      snapshotCount: snapshots.length,
      active: snapshots.filter((snapshot) => snapshot.tenant === tenant).length,
    };
  }

  public async status(): Promise<Awaited<ReturnType<EcosystemEngine['stats']>>> {
    return this.#engine.stats();
  }

  async #coerceRun(snapshot: unknown): Promise<Result<RecoveryRun>> {
    if (typeof snapshot !== 'object' || snapshot == null) {
      return fail(new Error('run-not-object'), 'hydrate');
    }
    try {
      return ok(parseRun(snapshot));
    } catch {
      return fail(new Error('parse-run-failed'), 'hydrate');
    }
  }
}

export const createServiceOrchestrator = (dependencies?: {
  readonly adapter: OrchestratorPort;
  readonly store: EcosystemStorePort;
}): { readonly orchestrator: RecoveryEcosystemOrchestrator; readonly dependencies: ServiceDependencies } => {
  const adapter = dependencies?.adapter ?? new NullAdapter();
  const store = dependencies?.store ?? createInMemoryStore();
  const orchestrator = new RecoveryEcosystemOrchestrator();
  const tenant = asTenantId('tenant:runtime');
  const namespace = composeNamespace('runtime');
  return {
    orchestrator,
    dependencies: {
      store,
      telemetry: {
        publish: async (_payload) => {},
        trace: async (_event, _metadata) => {},
      },
      adapter,
      tenant,
      namespace,
    },
  };
};

export interface ServiceRuntime {
  readonly orchestrator: RecoveryEcosystemOrchestrator;
  readonly dependencies: ServiceDependencies;
}

export const createServiceRuntime = (config?: Partial<AdapterConfig>): ServiceRuntime => {
  const adapter = createAdapter('recovery-ecosystem', config?.timeoutMs ?? 16);
  const store = createInMemoryStore();
  const orchestrator = new RecoveryEcosystemOrchestrator(config);
  const tenant = asTenantId('tenant:default');
  const namespace = composeNamespace('recovery-ecosystem');
  return {
    orchestrator,
    dependencies: {
      store,
      telemetry: {
        publish: async (payload) => {
          void payload;
        },
        trace: async (_event, metadata) => {
          void metadata;
        },
      },
      adapter,
      tenant,
      namespace,
    },
  };
};
