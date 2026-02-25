import { fail, ok, type Result } from '@shared/result';
import { z } from 'zod';
import type { NoInfer } from '@shared/type-level';
import { InProcessAdapterRegistry, createMockAdapter } from './adapters.js';
import { EventBus, EventCollector } from './telemetry.js';
import { buildTimeline } from './scheduler.js';
import { MeshPluginRegistry } from './registry.js';
import type { MeshPluginDefinition } from './plugins.js';
import { DEFAULT_STAGES, type StageName } from './types.js';
import {
  parseRunId,
  formatRunId,
  type RunId,
  type TenantId,
  type TenantWorkspace,
  type WorkspaceId,
} from './brands.js';
import type { EcosystemEvent } from './events.js';

export interface OrchestratorOptions {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly allowPartialRun?: boolean;
  readonly pluginWhitelist?: readonly string[];
}

const requestSchema = z.object({
  tenantId: z.string().regex(/^tenant:/),
  workspaceId: z.string().regex(/^workspace:/),
  request: z.record(z.unknown()),
});

type PluginOutputDurations = ReadonlyMap<string, number>;
type StageTimeline = ReadonlyMap<string, readonly [string, string][]>;

export interface OrchestratorExecution<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>> {
  readonly runId: RunId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly request: TInput;
  readonly pluginCount: number;
  readonly diagnostics: Readonly<Record<string, string>>;
  readonly stageCount: number;
  readonly pluginDurations: PluginOutputDurations;
  readonly stageDurations: StageTimeline;
  readonly events: readonly EcosystemEvent[];
  readonly output: TOutput;
  readonly elapsedMs: number;
}

export type OrchestratorRunOutcome<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>> =
  Result<OrchestratorExecution<TInput, TOutput>, Error>;

export interface MeshRunRequest<TInput extends Record<string, unknown>> {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly request: TInput;
}

const defaultSeed = {
  generatedAt: new Date().toISOString(),
  schemaVersion: 'v1.0.0',
  source: 'recovery-mesh-orchestrator-core',
};

const normalizeStage = (value: string): StageName =>
  DEFAULT_STAGES.includes(value as StageName) ? (value as StageName) : DEFAULT_STAGES[0];

export class EcosystemOrchestrator<
  TPlugins extends readonly MeshPluginDefinition[],
  TSeed extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly #plugins: TPlugins;
  readonly #registry: MeshPluginRegistry<TPlugins>;
  readonly #adapters = new InProcessAdapterRegistry();
  readonly #telemetry = new EventBus();
  readonly #seed: TSeed;

  public constructor(
    plugins: TPlugins,
    private readonly options: OrchestratorOptions,
    seed?: TSeed,
  ) {
    this.#plugins = plugins;
    this.#seed = seed ?? (defaultSeed as unknown as TSeed);
    this.#registry = new MeshPluginRegistry(this.#plugins);

    const meshPlugins = this.#plugins.filter((plugin) => plugin.namespace.startsWith('recovery-mesh:'));
    for (const plugin of meshPlugins) {
      this.#adapters.add(createMockAdapter(plugin.name));
    }
  }

  public async run<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
    request: MeshRunRequest<TInput>,
  ): Promise<OrchestratorRunOutcome<TInput, TOutput>> {
    const parsed = requestSchema.safeParse(request);
    if (!parsed.success) {
      return fail(new Error(parsed.error.message));
    }

    const tenantId = parsed.data.tenantId as TenantId;
    const workspaceId = parsed.data.workspaceId as WorkspaceId;
    const runId = formatRunId(tenantId, workspaceId, crypto.randomUUID());
    const resolvedRunId = parseRunId(runId);
    if (!resolvedRunId) {
      return fail(new Error('Invalid run identifier'));
    }

    const ordered = await this.#registry.resolveOrder();
    const timeline = buildTimeline(ordered, this.#plugins, new Date());
    const eventCollector = new EventCollector();
    const unsubscribe = this.#telemetry.addCollector(eventCollector);

    const contextSeed = {
      runId,
      tenantId,
      workspaceId,
      stage: DEFAULT_STAGES[0],
      startedAt: new Date().toISOString(),
      correlation: `${tenantId}/${workspaceId}` as TenantWorkspace,
    };

    const diagnostics: Record<string, string> = {};
    const pluginDurations: Map<string, number> = new Map();

    try {
      for (const [index, pluginName] of ordered.entries()) {
        const plugin = this.#registry.get(pluginName);
        if (!plugin) {
          return fail(new Error(`Unknown plugin ${pluginName}`));
        }

        const nextStage = normalizeStage(DEFAULT_STAGES[index] ?? contextSeed.stage);
        const startedAt = Date.now();
        const pluginOutput = await this.#adapters.run(
          plugin,
          parsed.data.request as NoInfer<TInput>,
          {
            ...contextSeed,
            stage: nextStage,
            pluginRun: `run-${nextStage}` as const,
          },
          this.#telemetry,
        );
        const elapsed = Date.now() - startedAt;

        pluginDurations.set(pluginName, elapsed);
        diagnostics[plugin.name] = JSON.stringify(pluginOutput);
      }

      const log = eventCollector.snapshot();
      const toLog = log.map((event, index) => ({
        ...event,
        eventId: `${event.eventId}-${index}` as EcosystemEvent['eventId'],
      }));

      const stageDurations = new Map<string, readonly [string, string][]>(
        timeline.map((slot) => [slot.plugin, [[slot.start.toISOString(), slot.end.toISOString()]]]),
      );

      const resultPayload = {
        runId: resolvedRunId,
        runStartedAt: contextSeed.startedAt,
        pluginDurations: Object.fromEntries(pluginDurations),
        stages: [...stageDurations.keys()].toSorted((left, right) => left.localeCompare(right)),
      } as unknown as TOutput;

      return ok({
        runId: resolvedRunId,
        tenantId,
        workspaceId,
        request: parsed.data.request as TInput,
        pluginCount: ordered.length,
        diagnostics,
        stageCount: stageDurations.size,
        pluginDurations,
        stageDurations,
        events: toLog,
        output: resultPayload,
        elapsedMs: Date.now() - new Date(contextSeed.startedAt).getTime(),
      });
    } finally {
      unsubscribe();
    }
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.#adapters.disposeAll();
    await this.#telemetry[Symbol.asyncDispose]();
  }

  public get seed(): string {
    return this.#seed && (this.#seed as { schemaVersion?: string }).schemaVersion
      ? `${(this.#seed as { schemaVersion?: string }).schemaVersion}`
      : defaultSeed.schemaVersion;
  }
}

export interface StageSnapshot {
  readonly pluginNames: readonly string[];
  readonly stageOrder: readonly string[];
  readonly seed: {
    readonly generatedAt: string;
    readonly schemaVersion: string;
    readonly source: string;
  };
}

export const buildOrchestrationSnapshot = async <TPlugins extends readonly MeshPluginDefinition[]>(
  plugins: TPlugins,
): Promise<StageSnapshot> => {
  const registry = new MeshPluginRegistry(plugins);
  const ordered = await registry.resolveOrder();
  return {
    pluginNames: [...ordered],
    stageOrder: [...ordered].toSorted((left, right) => left.localeCompare(right)),
    seed: defaultSeed,
  };
};
