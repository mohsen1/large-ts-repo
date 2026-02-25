import {
  createAsyncScope,
  type WorkbenchPluginContext,
  WorkbenchTelemetryBus,
  WorkbenchPluginRegistry,
} from '@shared/recovery-workbench-runtime';
import {
  buildPlan,
  executePlanOutput,
  isPlanReady,
  type WorkbenchPlan,
} from '@domain/recovery-workbench-models';
import {
  type WorkbenchCatalog,
  type WorkbenchMetadata,
  normalizeRunInput,
  type WorkbenchRunInput,
  type WorkbenchRunOutput,
  type WorkbenchPhase,
} from '@domain/recovery-workbench-models';
import {
  type WorkbenchRunId,
  type WorkbenchTenantId,
  type WorkbenchWorkspaceId,
  makeRunId,
} from '@domain/recovery-workbench-models';
import { bootstrap, bootstrapRunId, type RecoveryWorkbenchBootstrap } from './bootstrap';
import { recoveryCatalogDescriptors, type WorkbenchRuntimeDescriptor } from '@domain/recovery-workbench-models';
import { type WorkbenchPluginTrace } from '@domain/recovery-workbench-models';
import type { WorkbenchPluginId } from '@shared/recovery-workbench-runtime';

type WorkbenchRoute = 'route:ingest' | 'route:score' | 'route:publish';

export type RecoveryWorkbenchRunId = WorkbenchRunId;

export interface RecoveryOrchestratorConfig {
  readonly tenantId: WorkbenchTenantId;
  readonly workspaceId: WorkbenchWorkspaceId;
  readonly catalog: WorkbenchCatalog;
  readonly profile: RecoveryWorkbenchBootstrap['profile'];
}

interface RunLifecycle {
  readonly startedAt: number;
  readonly requestId: string;
  readonly routeCount: number;
}

type RuntimePluginOutput = {
  readonly payload: string;
  readonly score: number;
};

export interface RecoveryRunRecord {
  readonly runId: string;
  readonly output?: WorkbenchRunOutput;
  readonly error?: Error;
  readonly metadata?: {
    readonly durationMs: number;
    readonly phasesExecuted: number;
  };
}

export class RecoveryWorkbenchOrchestrator {
  readonly #registry: WorkbenchPluginRegistry<readonly WorkbenchRuntimeDescriptor[]>;
  readonly #telemetry: WorkbenchTelemetryBus = new WorkbenchTelemetryBus();
  readonly #stack = createAsyncScope();
  readonly #catalog: WorkbenchCatalog;
  readonly #profile: RecoveryWorkbenchBootstrap['profile'];

  constructor(config: RecoveryOrchestratorConfig) {
    const descriptors = recoveryCatalogDescriptors(config.tenantId);
    this.#registry = new WorkbenchPluginRegistry<readonly WorkbenchRuntimeDescriptor[]>(descriptors);
    this.#catalog = config.catalog;
    this.#profile = config.profile;

    this.#stack.adopt(this.#registry, () => {
      this.#registry[Symbol.dispose]();
    });

    this.#telemetry.record({
      route: 'bootstrap',
      name: 'orchestrator:init',
      value: 1,
      dimensions: {
        tenant: String(config.tenantId),
        workspace: String(config.workspaceId),
      },
    });
  }

  async run(input: WorkbenchRunInput): Promise<RecoveryRunRecord> {
    const context = normalizeRunInput(input);
    const plan = buildPlan(this.#catalog, context);
    const requestId = makeRunId(
      String(context.tenantId).replace('tenant:', ''),
      String(context.workspaceId).replace('workspace:', ''),
      `request-${Date.now()}`,
    );
    const lifecycle: RunLifecycle = {
      startedAt: Date.now(),
      requestId,
      routeCount: plan.routeOrder.length,
    };

    if (
      !isPlanReady(plan, {
        requestId,
        requestedBy: context.requestedBy,
        routeMatrix: [...plan.routeOrder.map((phase) => `route:${phase}` as WorkbenchRoute)],
        tenant: bootstrapRunId,
      } satisfies PlanContextMetadata)
    ) {
      return {
        runId: requestId,
        error: new Error('invalid execution context'),
      };
    }

    try {
      using _stack = createAsyncScope();
      const baseContext: WorkbenchPluginContext<WorkbenchRoute> = {
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        route: 'route:ingest',
        requestId,
        startedAt: Date.now(),
        correlation: {
          runId: requestId,
          operator: 'recovery-workbench',
        },
      };

    const traces: WorkbenchPluginTrace[] = [];
    const runnablePhases = plan.routeOrder.filter((phase): phase is Exclude<WorkbenchPhase, 'transform'> => phase !== 'transform');

      for (const phase of runnablePhases) {
        const route = `route:${phase}` as WorkbenchRoute;
        const routeContext: WorkbenchPluginContext<WorkbenchRoute> = {
          ...baseContext,
          route,
        };

        const pluginOutputs = await this.#registry.runRoute(
          route,
          {
            payload: `${phase}:${requestId}`,
            trace: `${route}:${requestId}`,
          },
          routeContext,
        );

        for (const output of pluginOutputs) {
          const value = output.output as RuntimePluginOutput;
          traces.push({
            pluginId: output.pluginId as unknown as WorkbenchPluginId,
            pluginName: output.pluginName,
            route,
            output: String(value.payload ?? ''),
            latencyMs: output.latencyMs,
            phase,
            confidence: Number.isNaN(value.score) ? 0 : value.score,
          });
        }
      }

      const output = executePlanOutput(plan, traces);

      this.#telemetry.record({
        route: 'orchestrator',
        name: 'run:completed',
        value: traces.length,
        dimensions: {
          tenant: String(context.tenantId),
          requestId: String(requestId),
        },
      });

      return {
        runId: requestId,
        output: {
          ...output,
          runId: requestId,
          totalDurationMs: Math.max(1, Date.now() - lifecycle.startedAt),
        },
        metadata: {
          durationMs: Date.now() - lifecycle.startedAt,
          phasesExecuted: lifecycle.routeCount,
        },
      };
    } catch (error) {
      this.#telemetry.record({
        route: 'orchestrator',
        name: 'run:failed',
        value: 1,
        dimensions: {
          tenant: String(context.tenantId),
        },
      });

      return {
        runId: requestId,
        error: error instanceof Error ? error : new Error('unknown error'),
      };
    }
  }

  async close(): Promise<void> {
    await this.#stack[Symbol.asyncDispose]();
  }

  get stats(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.#telemetry.topRoutes(16));
  }

  telemetry(): WorkbenchTelemetryBus {
    return this.#telemetry;
  }
}

type PlanContextMetadata = {
  readonly tenant: WorkbenchMetadata[keyof WorkbenchMetadata];
  readonly requestId: string;
  readonly requestedBy: string;
  readonly routeMatrix: readonly string[];
};

export const createOrchestrator = (config: RecoveryOrchestratorConfig): RecoveryWorkbenchOrchestrator => {
  return new RecoveryWorkbenchOrchestrator(config);
};

export const executeForTenant = async (
  tenant: WorkbenchTenantId,
  workspace: WorkbenchWorkspaceId,
): Promise<WorkbenchRunOutput | Error> => {
  const session = createOrchestrator({
    tenantId: tenant,
    workspaceId: workspace,
    catalog: bootstrap.catalog,
    profile: bootstrap.profile,
  });

  const record = await session.run({
    tenantId: tenant,
    workspaceId: workspace,
    requestedBy: 'system',
    phases: ['ingest', 'score', 'publish'],
    routes: ['route:ingest', 'route:score', 'route:publish'],
    metadata: {
      runMode: 'auto',
      profile: bootstrapRunId,
    },
  });

  await session.close();
  if ('output' in record && record.output) return record.output;
  return record.error ?? new Error('orchestrator failed');
};
