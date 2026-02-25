import { z } from 'zod';
import type {
  EcosystemEvent,
  MeshPluginDefinition,
  StageSnapshot,
  MeshRunRequest,
} from '@domain/recovery-ecosystem-orchestrator-core';
import {
  EcosystemOrchestrator,
  buildOrchestrationSnapshot,
  type OrchestratorExecution,
} from '@domain/recovery-ecosystem-orchestrator-core';
import type { TenantId, WorkspaceId } from '@domain/recovery-ecosystem-orchestrator-core';

export interface MeshRunSummary {
  readonly pluginId: string;
  readonly eventCount: number;
}

export interface MeshRunOutput<TOutput extends Record<string, unknown>> {
  readonly runId: string;
  readonly pluginCount: number;
  readonly stageCount: number;
  readonly diagnostics: Readonly<Record<string, string>>;
  readonly output: TOutput;
  readonly events: readonly EcosystemEvent[];
}

const runResultSchema = z.object({
  tenantId: z.string().regex(/^tenant:/),
  workspaceId: z.string().regex(/^workspace:/),
  request: z.record(z.unknown()),
});

const pluginPlanSchema = z.object({
  tenantId: z.string().regex(/^tenant:/),
  workspaceId: z.string().regex(/^workspace:/),
  pluginName: z.string().min(1),
  requestPath: z.string().min(1),
  version: z.string().regex(/^v\d+\.\d+\.\d+$/),
});

type PluginPlan<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>> = {
  readonly input: TInput;
  readonly output: TOutput;
};

const pluginPlanCache = new Map<string, PluginPlan<Record<string, unknown>, Record<string, unknown>>>();

export class MeshOrchestrationService {
  readonly #plugins: readonly MeshPluginDefinition[];
  readonly #tenantId: TenantId;
  readonly #workspaceId: WorkspaceId;

  public constructor(plugins: readonly MeshPluginDefinition[], tenantId: TenantId, workspaceId: WorkspaceId) {
    this.#plugins = plugins;
    this.#tenantId = tenantId;
    this.#workspaceId = workspaceId;
  }

  public async getSnapshot(): Promise<StageSnapshot> {
    return buildOrchestrationSnapshot(this.#plugins);
  }

  public async runScenario<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
    request: TInput,
  ): Promise<MeshRunOutput<TOutput>> {
    const validated = runResultSchema.parse({
      tenantId: this.#tenantId,
      workspaceId: this.#workspaceId,
      request,
    });

    const requestEnvelope: MeshRunRequest<TInput> = {
      tenantId: validated.tenantId as TenantId,
      workspaceId: validated.workspaceId as WorkspaceId,
      request: validated.request as TInput,
    };

    const orchestrator = new EcosystemOrchestrator(this.#plugins, {
      tenantId: requestEnvelope.tenantId,
      workspaceId: requestEnvelope.workspaceId,
      allowPartialRun: true,
      pluginWhitelist: ['recovery-mesh:core'],
    });

    const result = await orchestrator.run<TInput, TOutput>(requestEnvelope);
    if (!result.ok) {
      throw result.error;
    }

    return {
      runId: result.value.runId,
      pluginCount: result.value.pluginCount,
      stageCount: result.value.stageCount,
      diagnostics: this.#buildDiagnostics(result.value.diagnostics),
      output: result.value.output,
      events: result.value.events,
    };
  }

  public getPluginRegistry() {
    return this.#plugins.map((plugin) => ({
      name: plugin.name,
      namespace: plugin.namespace,
      stage: plugin.stage,
      tags: plugin.tags,
      meta: plugin.metadata,
      schemaVersion: 'catalog-v1',
    }));
  }

  #buildDiagnostics(diagnostics: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
    const normalized: Record<string, string> = {};
    for (const [name, details] of Object.entries(diagnostics)) {
      normalized[name] = details;
    }
    return normalized;
  }

  #buildSummary(events: readonly EcosystemEvent[]): readonly MeshRunSummary[] {
    const totalByPlugin = new Map<string, number>();
    for (const event of events) {
      const count = totalByPlugin.get(event.pluginId) ?? 0;
      totalByPlugin.set(event.pluginId, count + 1);
    }
    return Array.from(totalByPlugin.entries()).map(([pluginId, eventCount]) => ({ pluginId, eventCount }));
  }
}

export const createMeshService = (plugins: readonly MeshPluginDefinition[]) => {
  const tenantId = 'tenant:console' as TenantId;
  const workspaceId = 'workspace:recovery-ecosystem' as WorkspaceId;
  return new MeshOrchestrationService(plugins, tenantId, workspaceId);
};

export const resolvePlan = <TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
  input: TInput,
  pluginName: string,
): PluginPlan<TInput, TOutput> => {
  const cached = pluginPlanCache.get(pluginName);
  if (cached) {
    return cached as PluginPlan<TInput, TOutput>;
  }

  const parsed = pluginPlanSchema.parse({
    tenantId: 'tenant:console',
    workspaceId: 'workspace:recovery-ecosystem',
    pluginName,
    requestPath: '/recovery/mesh/run',
    version: 'v1.0.0',
  });

  const output = {
    pluginName: parsed.pluginName,
    pluginVersion: parsed.version,
    requestPath: parsed.requestPath,
  };

  const plan: PluginPlan<TInput, TOutput> = {
    input: parsed as unknown as TInput,
    output: output as unknown as TOutput,
  };

  pluginPlanCache.set(
    pluginName,
    {
      input: parsed as unknown as Record<string, unknown>,
      output: output as Record<string, unknown>,
    },
  );

  return plan;
};

export const normalizeEvents = <T extends readonly EcosystemEvent[]>(events: T): T => {
  const sorted = [...events]
    .filter((event) => typeof event.at === 'string')
    .toSorted((left, right) => left.at.localeCompare(right.at));
  return sorted as unknown as T;
};

export const mapEventsAsync = async <TEvent extends { readonly at: string }>(
  source: Iterable<TEvent> | AsyncIterable<TEvent>,
  mapper: (event: TEvent) => Promise<TEvent>,
): Promise<readonly TEvent[]> => {
  const output: TEvent[] = [];
  for await (const event of source) {
    output.push(await mapper(event));
  }
  return output;
};

export class MeshDiagnosticsCollector<TEvent extends { readonly at: string }> {
  readonly #history: TEvent[] = [];
  readonly #consumers = new Set<(event: TEvent) => void>();
  #disposed = false;

  public push(events: readonly TEvent[]): void {
    if (this.#disposed) {
      return;
    }

    for (const event of events) {
      this.#history.push(event);
      for (const consumer of this.#consumers) {
        consumer(event);
      }
    }
  }

  public subscribe(consumer: (event: TEvent) => void): () => void {
    this.#consumers.add(consumer);
    return () => {
      this.#consumers.delete(consumer);
    };
  }

  public get history(): readonly TEvent[] {
    return [...this.#history];
  }

  public dispose(): void {
    this.#disposed = true;
    this.#consumers.clear();
    this.#history.length = 0;
  }
}

const unusedSummary = (events: readonly EcosystemEvent[]): readonly MeshRunSummary[] => {
  const seen: Record<string, number> = {};
  for (const event of events) {
    seen[event.pluginId] = (seen[event.pluginId] ?? 0) + 1;
  }
  return Object.entries(seen).map(([pluginId, eventCount]) => ({
    pluginId,
    eventCount,
  }));
};

void unusedSummary;
