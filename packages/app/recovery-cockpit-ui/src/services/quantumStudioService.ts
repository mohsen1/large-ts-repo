import { z } from 'zod';
import {
  runBaselinePlan,
  runWithPlugins,
  type EngineMode,
  type EngineResult,
  type QuantumRunResult,
  type RuntimeSummary,
  type ScenarioSeed,
  ensurePluginName,
  scenarioId,
  tenantId,
  namespaceId,
} from '@shared/quantum-studio-core';

export type QuantumRunStatus = 'idle' | 'running' | 'ready' | 'failed';

export type QuantumOutput = {
  readonly mode: EngineMode;
  readonly scenario: ScenarioSeed;
  readonly diagnostics: {
    readonly status: QuantumRunStatus;
    readonly stamp: string;
  };
};

export type QuantumRunSummary = RuntimeSummary<QuantumOutput>;
export type QuantumRunResultView = Omit<EngineResult<QuantumOutput>, 'summary'> & {
  readonly summary: QuantumRunSummary;
};

const runQuerySchema = z.object({
  mode: z.enum(['dry-run', 'live']),
  tenant: z.string().min(1),
  scenario: z.string().min(1),
});

const hydrateSeed = (tenant: string, scenario: string, mode: ScenarioSeed['requestedMode']): ScenarioSeed => ({
  tenant: tenantId(tenant),
  scenarioId: scenarioId(scenario),
  profile: {
    namespace: namespaceId('recovery'),
    tenant: tenantId(tenant),
    scenarioId: scenarioId(scenario),
    scenarioName: scenario,
    graph: {
      nodes: [],
      edges: [],
    },
    metadata: {
      source: 'query',
      requestMode: mode,
    },
    seedSignals: [],
  },
  selectedPlugins: ['plugin:recovery/source'],
  requestedMode: mode,
});

export const runQuantumPlan = async (
  query: unknown,
  defaultMode: EngineMode = 'dry-run',
): Promise<QuantumRunResultView> => {
  const parsed = runQuerySchema.parse(query);
  const selectedMode = parsed.mode as EngineMode;
  const outputSeed = hydrateSeed(parsed.tenant, parsed.scenario, parsed.mode === 'live' ? 'control' : 'discovery');

  const baseline = await runBaselinePlan<QuantumOutput>(selectedMode);
  const stamped: QuantumOutput = {
    mode: selectedMode,
    scenario: outputSeed,
    diagnostics: {
      status: outputSeed.selectedPlugins.length > 0 ? 'ready' : 'idle',
      stamp: new Date().toISOString(),
    },
  };

  return {
    run: {
      ...baseline.run,
      output: stamped,
    },
    summary: {
      ...baseline.summary,
      results: {
        ...baseline.summary.results,
        output: stamped,
      },
    },
    signalState: baseline.signalState,
  };
};

export const runBatch = async (
  scenarios: readonly ScenarioSeed[],
  mode: EngineMode = 'dry-run',
): Promise<readonly QuantumRunResultView[]> => {
  const out: QuantumRunResultView[] = [];

  for (const scenario of scenarios) {
    const result = await runQuantumPlan({
      mode,
      tenant: scenario.tenant,
      scenario: scenario.scenarioId,
    }, mode);
    out.push(result);
  }

  return out;
};

export const runStudioCustom = async (mode: EngineMode = 'dry-run'): Promise<QuantumRunResultView> => {
  const baseline = await runWithPlugins<QuantumOutput>(
    [
      {
        namespace: 'recovery',
        name: ensurePluginName('recovery', 'source'),
        kind: 'source',
        tags: ['source'],
        dependsOn: [],
        metadata: {
          createdAt: '2026-02-25T00:00:00.000Z',
          version: 'v1.0.0',
          owner: 'owner:ui',
        },
        async run(input, context) {
          return {
            status: 'success',
            skipped: false,
            payload: {
              mode,
              scenario: {
                tenant: tenantId(context.tenant),
                scenarioId: scenarioId(context.node),
                profile: {
                  namespace: namespaceId('recovery'),
                  tenant: tenantId(context.tenant),
                  scenarioId: scenarioId(context.node),
                  scenarioName: context.node,
                  graph: {
                    nodes: [],
                    edges: [],
                  },
                  metadata: {},
                  seedSignals: [],
          },
          selectedPlugins: ['plugin:recovery/source'],
          requestedMode: 'discovery',
        },
              diagnostics: {
                status: 'ready',
                stamp: new Date().toISOString(),
              },
            },
            artifacts: ['runStudioCustom'],
            elapsedMs: 2,
          };
        },
        async transform(input) {
          return input;
        },
      },
    ],
    {
      tenant: tenantId('tenant-studio'),
      scenarioId: scenarioId('custom'),
      profile: {
        namespace: namespaceId('recovery'),
        tenant: tenantId('tenant-studio'),
        scenarioId: scenarioId('custom'),
        scenarioName: 'custom',
        graph: { nodes: [], edges: [] },
        metadata: {},
        seedSignals: [],
      },
      selectedPlugins: ['plugin:recovery/source'],
      requestedMode: 'discovery',
    },
    mode,
  );

  return baseline;
};

export const summarizeResult = (run: QuantumRunResult): string => {
  if (run.output && typeof run.output === 'object') {
    return `run:${run.runId}:${run.scenarioId}`;
  }
  return `run:${run.runId}`;
};
