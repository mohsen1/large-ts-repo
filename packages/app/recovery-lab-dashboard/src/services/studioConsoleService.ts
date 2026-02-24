import {
  type PluginCatalog,
  type PluginExecutionInput,
  type PluginExecutionOutput,
  type PluginStage,
  type PluginSpec,
  Registry,
} from '@shared/lab-simulation-kernel';
import { RecoveryStudioOrchestrator } from '@service/recovery-lab-orchestration-studio';
import {
  type StudioInput,
  parseWorkspaceInput,
} from '@domain/recovery-lab-signal-studio/src/schema';

const makeBaselineCatalog = (): PluginCatalog => {
  const probes = [
    {
      spec: {
        name: 'probe.detect@v1' as PluginSpec<'probe.detect@v1'>['name'],
        stage: 'detect' as const,
        version: '1.0',
        weight: 1,
      },
      name: 'probe.detect@v1',
      stage: 'detect' as PluginStage,
      async run(input: PluginExecutionInput<unknown>): Promise<PluginExecutionOutput<unknown>> {
        return {
          plugin: 'probe.detect@v1',
          stage: input.stage,
          durationMs: 10,
          payload: { kind: 'detect', source: input.runId },
          warnings: [],
        };
      },
    },
    {
      spec: {
        name: 'inject.disrupt@v1' as PluginSpec<'inject.disrupt@v1'>['name'],
        stage: 'disrupt' as const,
        version: '1.0',
        weight: 2,
      },
      name: 'inject.disrupt@v1',
      stage: 'disrupt' as PluginStage,
      async run(input: PluginExecutionInput<unknown>): Promise<PluginExecutionOutput<unknown>> {
        return {
          plugin: 'inject.disrupt@v1',
          stage: input.stage,
          durationMs: 12,
          payload: { kind: 'disrupt', source: input.runId },
          warnings: [],
        };
      },
    },
    {
      spec: {
        name: 'verify.integrity@v1' as PluginSpec<'verify.integrity@v1'>['name'],
        stage: 'verify' as const,
        version: '1.0',
        weight: 1,
      },
      name: 'verify.integrity@v1',
      stage: 'verify' as PluginStage,
      async run(input: PluginExecutionInput<unknown>): Promise<PluginExecutionOutput<unknown>> {
        return {
          plugin: 'verify.integrity@v1',
          stage: input.stage,
          durationMs: 13,
          payload: { kind: 'verify', source: input.runId },
          warnings: [],
        };
      },
    },
    {
      spec: {
        name: 'restore.traffic@v1' as PluginSpec<'restore.traffic@v1'>['name'],
        stage: 'restore' as const,
        version: '1.0',
        weight: 1,
      },
      name: 'restore.traffic@v1',
      stage: 'restore' as PluginStage,
      async run(input: PluginExecutionInput<unknown>): Promise<PluginExecutionOutput<unknown>> {
        return {
          plugin: 'restore.traffic@v1',
          stage: input.stage,
          durationMs: 22,
          payload: { kind: 'restore', source: input.runId },
          warnings: [],
        };
      },
    },
  ] as const;

  return probes as PluginCatalog;
};

const registry = Registry.create(makeBaselineCatalog());
const orchestrator = new RecoveryStudioOrchestrator(registry.scope().catalog);

export interface StudioServiceResult {
  readonly ok: boolean;
  readonly status: string;
  readonly runId: string;
  readonly traces: readonly string[];
}

export const runStudioScenario = async (
  tenant: string,
  workspace: string,
  scenario: string,
): Promise<StudioServiceResult> => {
  const payload: StudioInput = parseWorkspaceInput({ tenant, workspace, scenarioId: scenario, pluginFilter: [], includeTelemetry: true });
  const result = await orchestrator.run(payload);

  if (!result.ok) {
    return {
      ok: false,
      status: `failed:${result.error.message}`,
      runId: `${tenant}:${workspace}:${scenario}`,
      traces: [String(result.error)],
    };
  }

  return {
    ok: result.value.ok,
    status: result.value.status,
    runId: result.value.runId,
    traces: result.value.traces,
  };
};

export const pluginResultSignature = <T>(value: T): string => {
  return `${typeof value}:${new Date().toISOString()}`;
};

export const pluginResultToTrace = (output: PluginExecutionOutput<unknown>): string =>
  `${output.plugin}:${output.stage}:${output.durationMs.toFixed(1)}`;
