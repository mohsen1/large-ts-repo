import { z } from 'zod';
import { fail, ok, type Result } from '@shared/result';
import {
  asChaosRunId,
  type ChaosTenantId,
  type ChaosWorkspaceId,
  type ChaosRunId,
  type ChaosScope,
  type ChaosSignalEnvelope,
  asChaosScenarioId,
  asChaosTenantId,
  type RuntimeEnvelope,
  type ChaosEntityId,
  type EpochMs,
  type ChaosRunPhase,
  type RuntimeSignal,
  runWithSignals
} from '@shared/chaos-lab-console-kernel';
import type { StageBoundary } from '@domain/recovery-chaos-lab';
import {
  consoleDashboardInputSchema,
  type ConsoleDashboardInput,
  type ConsolePlanResult,
  normalizeScopes
} from './types';
import type { RegistryLike, PluginAdapter } from '@service/recovery-chaos-orchestrator';

export interface PluginSpec {
  readonly namespace: string;
  readonly id: string;
  readonly kind: string;
}

const pluginSchema = z
  .object({
    namespace: z.string(),
    id: z.string(),
    kind: z.string()
  })
  .strict();

export function parseConsoleInput(value: unknown): Result<ConsoleDashboardInput> {
  const parsed = consoleDashboardInputSchema.safeParse(value);
  if (!parsed.success) {
    return fail(new Error(parsed.error.message));
  }
  return ok(parsed.data);
}

export function parsePlugins(value: readonly unknown[]): Result<readonly PluginSpec[]> {
  const output: PluginSpec[] = [];
  for (const raw of value) {
    const parsed = pluginSchema.safeParse(raw);
    if (!parsed.success) {
      return fail(new Error(`plugin parse failed: ${parsed.error.message}`));
    }
    output.push(parsed.data);
  }
  return ok(output);
}

export function toWorkspaceId(tenant: string, workspace: string): ChaosWorkspaceId {
  return `${tenant}::${workspace}` as ChaosWorkspaceId;
}

export function toTenantId(tenant: string): ChaosTenantId {
  return tenant as ChaosTenantId;
}

export function buildConsolePlan(
  request: ConsoleDashboardInput,
  stages: readonly ChaosScope[]
): Result<{
  readonly id: string;
  readonly runId: ChaosRunId;
  readonly workspace: ChaosWorkspaceId;
  readonly manifest: ConsolePlanResult<readonly StageBoundary<string, unknown, unknown>[]>['manifest'];
}> {
  if (stages.length === 0) {
    return fail(new Error('plan has no stages'));
  }

  const workspace = toWorkspaceId(request.tenant, request.workspace);
  const requestScopes = normalizeScopes(request.scopes);
  const now = Date.now();
  return ok({
    id: `plan:${request.scenario}`,
    runId: asChaosRunId(`${request.scenario}:${now}`),
    workspace,
    manifest: {
      runId: asChaosRunId(`${request.scenario}:${now}`),
      tenant: asChaosTenantId(request.tenant),
      scenarioId: asChaosScenarioId(request.scenario),
      phases: stages,
      metadata: {
        mode: request.mode,
        scopeCount: requestScopes.length,
        topK: request.topK,
        refreshMs: request.refreshMs
      },
      startedAt: now as never,
      completeBy: (now + request.refreshMs) as never,
    } as const
  });
}

export function createRegistry<TStages extends readonly StageBoundary<string, unknown, unknown>[]>
(
  stages: TStages,
  plugins: readonly PluginSpec[]
): RegistryLike<TStages> {
  const map = new Map<string, PluginAdapter<TStages[number]>>();

  for (const [index, stage] of stages.entries()) {
    const binding = plugins[index] ?? { namespace: 'runtime', id: `${stage.name}`, kind: stage.name };
    const plugin: PluginAdapter<StageBoundary<string, unknown, unknown>> = {
      plugin: stage.name,
      execute: async () => ({
        ok: true,
        value: stage.output as never
      })
    };
    map.set(String(binding.kind), plugin as PluginAdapter<TStages[number]>);
  }

  return {
    get(name) {
      return map.get(String(name)) as TStages[number] extends infer TStage
        ? PluginAdapter<Extract<TStages[number], { name: typeof name }> & TStage> | undefined
        : never;
    }
  } as RegistryLike<TStages>;
}

export async function buildConsoleSignals(
  runId: ChaosRunId,
  events: readonly { kind: string; payload: unknown; at: number }[]
): Promise<readonly Result<RuntimeEnvelope<unknown>>[]> {
  const emitted = events.map((event, index) => ({
    runId,
    phase: `phase:ingest` as ChaosRunPhase,
    at: event.at as never,
    event: {
      id: `${runId}:signal:${index}` as unknown as ChaosEntityId,
      kind: `${event.kind}::signal` as unknown as ChaosSignalEnvelope['kind'],
      tenant: 'tenant:realtime' as ChaosTenantId,
      createdAt: new Date().toISOString() as never,
      at: event.at as EpochMs,
      payload: event.payload
    }
  }));

  const outputs = await Promise.all(
    emitted.map((entry) => runWithSignals(String(runId), [entry]))
  );
  return outputs;
}

export function pluginExecutionScore(signalCount: number, runCount: number): number {
  if (runCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (signalCount / runCount) * 100));
}
