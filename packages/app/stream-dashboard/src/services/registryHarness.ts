import { createStudioOrchestrator, type StudioOrchestratorInput } from '@service/recovery-stress-lab-orchestrator';
import {
  PluginRegistry,
  type PluginDefinition,
  type PluginKind,
  type PluginResult,
  type PluginContext,
  buildPluginVersion,
  canonicalizeNamespace,
  createPluginId,
  withAsyncPluginScope,
} from '@shared/stress-lab-runtime';
import { createTenantId } from '@domain/recovery-stress-lab';

export type RegistryHarnessInput = {
  readonly tenantId: string;
  readonly preferredStage: 'input' | 'shape' | 'plan' | 'simulate' | 'recommend';
};

export interface RegistryHarnessRun {
  readonly tenantId: string;
  readonly registered: readonly string[];
  readonly pluginSummary: readonly string[];
  readonly summary: string;
}

const orchestrator = createStudioOrchestrator();
const harnessNamespace = canonicalizeNamespace('recovery:stress:lab');

const fallbackDefinition = (
  tenantId: string,
  kind: PluginKind,
  stage: string,
): PluginDefinition<{ value: string }, { value: string }, Record<string, unknown>> => ({
  id: createPluginId(harnessNamespace, kind, `${tenantId}:${stage}`),
  name: `harness-${stage}`,
  namespace: harnessNamespace,
  kind,
  version: buildPluginVersion(1, 0, 0),
  tags: ['harness', stage, tenantId],
  dependencies: ['dep:recovery:stress:lab'],
  config: { stage },
  run: async (_context: PluginContext<Record<string, unknown>>, input: { value: string }): Promise<PluginResult<{ value: string }>> => ({
    ok: true,
    value: { value: `${input.value}::${stage}` },
    generatedAt: new Date().toISOString(),
  }),
});

export const runRegistryHarness = async (input: RegistryHarnessInput): Promise<RegistryHarnessRun> => {
  const registry = PluginRegistry.create(harnessNamespace);
  const kinds: PluginKind[] = ['stress-lab/input-validator', 'stress-lab/topology-builder', 'stress-lab/simulator'];

  for (const kind of kinds) {
    registry.register(fallbackDefinition(input.tenantId, kind, input.preferredStage));
  }

  const pluginSummary = registry.summary();
  const runInput: StudioOrchestratorInput = {
    tenantId: createTenantId(input.tenantId),
    signals: [],
    topology: [],
    runbooks: [],
  };

  const run = await withAsyncPluginScope(
    {
      tenantId: input.tenantId,
      namespace: harnessNamespace,
      requestId: `harness:${input.tenantId}:${input.preferredStage}`,
      startedAt: new Date().toISOString(),
    },
    async () => {
      const result = await orchestrator.run(runInput);
      return result;
    },
  );

  return {
    tenantId: input.tenantId,
    registered: registry.list().map((entry) => String(entry.id)),
    pluginSummary: [
      ...pluginSummary.kinds,
      ...run.plansTriage.map((entry) => `${entry.id}:${entry.priority}`),
      ...run.events,
    ],
    summary: `${input.tenantId}|${input.preferredStage}|${run.snapshot.ready}`,
  };
};
