import {
  parseWorkspaceInput,
  parseWorkspaceCommand,
  type StudioInput,
  type WorkspaceCommand,
} from '@domain/recovery-lab-signal-studio/src/schema';
import { createExecutionPlan, summarizeRunOutput, buildInput } from '@domain/recovery-lab-signal-studio/src/planner';
import {
  createCatalog,
  Registry,
  createDisposableScope,
  summarizePlugins,
  type PluginCatalog,
  type PluginExecutionInput,
} from '@shared/lab-simulation-kernel';
import { ok, fail, type Result } from '@shared/result';
import { MemoryTwinRepository } from '@data/recovery-lab-digital-twin-store/src/repository';
import { buildSnapshot } from '@data/recovery-lab-digital-twin-store/src/timeline-store';
import { Brand, NoInfer } from '@shared/type-level';
import type { TenantId, WorkspaceId } from '@domain/recovery-lab-signal-studio/src/models';

export interface OrchestratorConfig {
  readonly tenant: string;
  readonly workspace: string;
  readonly planId: string;
}

export type OrchestratorRunId = Brand<string, 'TwinId'>;

export interface OrchestratorResult {
  readonly ok: boolean;
  readonly status: string;
  readonly runId: OrchestratorRunId;
  readonly traces: readonly string[];
}

export interface OrchestratorWorkspace {
  readonly tenant: string;
  readonly workspace: string;
  readonly catalog: PluginCatalog;
}

export class RecoveryStudioOrchestrator<TCatalog extends PluginCatalog> {
  readonly #catalog: TCatalog;
  readonly #registry: Registry<TCatalog>;
  readonly #repository = new MemoryTwinRepository();

  public constructor(catalog: NoInfer<TCatalog>) {
    this.#catalog = createCatalog(catalog);
    this.#registry = Registry.create(this.#catalog);
  }

  public get catalog(): TCatalog {
    return this.#catalog;
  }

  public async run(input: StudioInput): Promise<Result<OrchestratorResult, Error>> {
    const safeInput = parseWorkspaceInput(input);
    const runId = `${safeInput.tenant}-${safeInput.workspace}-${safeInput.scenarioId}` as OrchestratorRunId;
    const plan = createExecutionPlan(safeInput.tenant, safeInput.scenarioId, this.#catalog);
    const tenant = safeInput.tenant as TenantId;
    const workspace = safeInput.workspace as WorkspaceId;

    const stack = createDisposableScope();
    await using _scope = stack;

    const traces: string[] = [];
    const planByLane = summarizePlugins(this.#catalog);

    for (const [lane, names] of Object.entries(planByLane)) {
      const inputEnvelope: PluginExecutionInput<unknown> = buildInput(
        tenant,
        workspace,
        safeInput.scenarioId,
        { lane, names },
      );
      traces.push(`lane:${lane}:${names.length}:${plan.scenario}`);

      const outputs = await this.#registry.execute(lane as 'detect' | 'disrupt' | 'verify' | 'restore', inputEnvelope, (trace, output) => {
        traces.push(`${trace.plugin}:${trace.stage}:${trace.ms}`);
      });
      traces.push(summarizeRunOutput(lane as any, outputs));
    }

    const summary = {
      id: plan.scenario,
      tenant: safeInput.tenant,
      workspace: safeInput.workspace,
      runAt: new Date().toISOString(),
      lanes: Object.values(planByLane).flat(),
    };

    const record = {
      id: runId as any,
      tenant,
      workspace,
      runId,
      status: 'completed' as const,
      startedAt: new Date().toISOString(),
      metrics: { steps: plan.steps.length },
    };
    await this.#repository.save(record);

    const snapshot = buildSnapshot(record, []);
    await this.#repository.appendSnapshot(runId, snapshot, {
      preserveWindowCount: Math.max(1, plan.steps.length),
      maxHistory: 12,
    });

    return ok({
      ok: true,
      status: 'completed',
      runId,
      traces,
    });
  }

  public async command(command: WorkspaceCommand): Promise<Result<{ runId: OrchestratorRunId; traces: readonly string[] }, Error>> {
    const safe = parseWorkspaceCommand(command);
    const safeInput = parseWorkspaceInput({
      tenant: 'tenant-default',
      workspace: safe.workspace,
      scenarioId: 'command-default',
      pluginFilter: [],
      includeTelemetry: true,
    });
    const output = await this.run(safeInput);

    if (!output.ok) {
      return fail(output.error);
    }

    const runId = `${safeInput.tenant}:${safe.workspace}:${safeInput.scenarioId}:${safe.command}` as OrchestratorRunId;
    return ok({
      runId,
      traces: output.value.traces,
    });
  }
}

export const bootstrapOrchestrator = <T extends PluginCatalog>(catalog: T): RecoveryStudioOrchestrator<T> =>
  new RecoveryStudioOrchestrator<T>(createCatalog(catalog));
