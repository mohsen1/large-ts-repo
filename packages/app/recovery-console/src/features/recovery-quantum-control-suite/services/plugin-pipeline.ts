import type { PluginDefinition, PluginLifecycle } from '@shared/typed-orchestration-core/registry';
import type { PluginName } from '@shared/typed-orchestration-core/registry';
import { asBrand } from '@shared/typed-orchestration-core/brands';
import { rawPluginSeeds, seedManifests } from './manifest';
import type {
  PluginSeed,
  QuantumInput,
  QuantumOutput,
  QuantumRunId,
  QuantumSessionId,
  QuantumTenantId,
} from '../types';

type DomainSeed = Omit<PluginSeed, 'dependsOn'> & {
  readonly dependsOn: readonly PluginName[];
};

export type QuantumPlugin = PluginDefinition<QuantumInput, QuantumOutput, PluginName>;

export interface PluginBundle<TInput = QuantumInput, TOutput = QuantumOutput> {
  readonly sessionId: QuantumSessionId;
  readonly runId: QuantumRunId;
  readonly tenant: QuantumTenantId;
  readonly plugins: readonly PluginDefinition<TInput, TOutput, PluginName>[];
}

export interface PluginContext<TInput> {
  readonly runId: QuantumRunId;
  readonly sessionId: QuantumSessionId;
  readonly tenant: QuantumTenantId;
  readonly correlationPath: string;
  readonly input: TInput;
}

const asOutput = (input: QuantumInput): QuantumOutput => ({
  runId: input.runId,
  executedAt: new Date().toISOString(),
  summary: `summary:${input.runId}`,
  stages: [
    {
      stage: input.stage,
      stageRunId: input.runId,
      directives: [],
      artifactPayload: {
        mode: 'input',
        signalCount: input.signals.values.length,
      },
    },
  ],
  directives: [],
  status: 'ok',
});

export const makePluginContext = (runId: QuantumRunId, tenant: QuantumTenantId): PluginContext<QuantumInput> => {
  const sessionId = asBrand(`session-${runId}`, 'SessionId') as QuantumSessionId;
  return {
    runId,
    sessionId,
    tenant,
    correlationPath: `${tenant}/${runId}`,
    input: {
      runId,
      tenant,
      shape: 'adaptive',
      stage: 'stage:normalize',
      signals: {
        id: `envelope-${runId}`,
        runId,
        recordedAt: new Date().toISOString(),
        values: [],
      },
      budgetMs: 500,
    },
  };
};

const buildPluginName = (seed: DomainSeed): {
  readonly run: (name: 'normalize' | 'score' | 'policy') => PluginLifecycle<QuantumInput, QuantumOutput>;
} => {
  const normalize = async (input: QuantumInput | QuantumOutput): Promise<{
    status: 'success';
    skipped: false;
    message: string;
    elapsedMs: number;
    artifacts: readonly string[];
    output: QuantumOutput;
  }> => {
    const source = input as QuantumInput;
    return {
      status: 'success',
      skipped: false,
      message: `normalized:${seed.name}`,
      elapsedMs: 4,
      artifacts: [`normalize:${seed.name}`],
      output: {
        runId: source.runId,
        executedAt: new Date().toISOString(),
        summary: `summary:${seed.name}`,
        stages: [
          {
            stage: source.stage,
            stageRunId: source.runId,
            directives: [
              {
                id: `directive:${seed.name}`,
                command: 'synchronize',
                reason: `${seed.namespace}:${seed.version}`,
                priority: 1,
                dependencies: seed.dependsOn.map(String),
              },
            ],
            artifactPayload: {
              normalized: true,
              mode: seed.version,
            },
          },
        ],
        directives: [
          {
            id: `directive:${seed.name}`,
            command: 'synchronize',
            reason: `seed:${seed.name}`,
            priority: 1,
            dependencies: seed.dependsOn.map(String),
          },
        ],
        status: 'ok',
      },
    };
  };

  const score = async (input: QuantumInput): Promise<any> => {
    const source = asOutput(input as QuantumInput);
    return {
      status: 'success',
      skipped: false,
      message: `score:${seed.name}`,
      elapsedMs: 8,
      artifacts: [`score:${seed.name}`],
      output: source,
    };
  };

  const policy = async (input: QuantumInput): Promise<any> => {
    const source = asOutput(input as QuantumInput);
    return {
      status: 'success',
      skipped: false,
      message: `policy:${seed.name}`,
      elapsedMs: 6,
      artifacts: [`policy:${seed.name}`],
      output: {
        ...source,
        directives: [
          ...source.directives,
          {
            id: `directive:${seed.name}:policy`,
            command: 'throttle',
            reason: `policy:${seed.namespace}`,
            priority: 2,
            dependencies: [source.summary],
          },
        ],
      },
    };
  };

  return {
    run: (kind) => {
      if (kind === 'score') {
        return score;
      }
      if (kind === 'policy') {
        return policy;
      }
      return normalize;
    },
  };
};

export const buildPlugins = (): readonly QuantumPlugin[] => {
  const seeds = seedManifests as readonly DomainSeed[];
  const phases = ['normalize', 'score', 'policy'] as const;

  return seeds.map((seed, index) => ({
    ...seed,
    run: buildPluginName(seed).run(phases[Math.min(index, phases.length - 1)]),
  })) as readonly QuantumPlugin[];
};
