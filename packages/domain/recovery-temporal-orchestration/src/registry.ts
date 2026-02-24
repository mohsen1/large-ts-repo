import {
  type Brand,
  type EntityId,
  isoNow,
  type IsoTimestamp,
  type StageId,
  asStageId,
  isTemporalKind,
} from '@shared/temporal-ops-runtime';
import {
  TemporalPluginRegistry,
  type PluginDefinitionShape,
  type PluginName,
  type TemporalPluginContext,
} from '@shared/temporal-ops-runtime/plugin-registry';
import type {
  OrchestrationSignal,
  TimelineNode,
  TemporalRunbook,
  TemporalPhase,
} from './models';

export interface TemporalDomainPluginInput {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly scope: string;
  readonly runbook: TemporalRunbook;
}

export interface TemporalDomainPluginOutput {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly runbook: TemporalRunbook;
  readonly signals: readonly OrchestrationSignal<'domain', unknown>[];
}

export type TemporalDomainPluginSpec = {
  [name: `plugin:${string}`]: PluginDefinitionShape & {
    execute(
      input: TemporalDomainPluginInput,
      context: TemporalPluginContext,
    ): Promise<TemporalDomainPluginOutput>;
  };
};

export type StageNodeByName<TStage extends TemporalPhase> = {
  readonly phase: `phase:${TStage}`;
  readonly name: `plugin:${TStage}`;
};

export const domainStages = [
  'phase:ingest',
  'phase:validate',
  'phase:simulate',
  'phase:execute',
  'phase:verify',
] as const;

type RegistryPluginMap = {
  'plugin:ingest': {
    readonly name: 'plugin:ingest';
    readonly phase: 'phase:ingest';
    readonly config: { channel: 'kafka' | 'sse'; tenant: string };
    readonly inputSchema: (value: unknown) => value is TemporalDomainPluginInput;
    execute(
      input: TemporalDomainPluginInput,
      context: TemporalPluginContext,
    ): Promise<TemporalDomainPluginOutput>;
  };
  'plugin:validate': {
    readonly name: 'plugin:validate';
    readonly phase: 'phase:validate';
    readonly config: { strict: boolean };
    readonly inputSchema: (value: unknown) => value is TemporalDomainPluginInput;
    execute(
      input: TemporalDomainPluginInput,
      context: TemporalPluginContext,
    ): Promise<TemporalDomainPluginOutput>;
  };
  'plugin:simulate': {
    readonly name: 'plugin:simulate';
    readonly phase: 'phase:simulate';
    readonly config: { seed: string };
    readonly inputSchema: (value: unknown) => value is TemporalDomainPluginInput;
    execute(
      input: TemporalDomainPluginInput,
      context: TemporalPluginContext,
    ): Promise<TemporalDomainPluginOutput>;
  };
  'plugin:execute': {
    readonly name: 'plugin:execute';
    readonly phase: 'phase:execute';
    readonly config: { concurrency: number };
    readonly inputSchema: (value: unknown) => value is TemporalDomainPluginInput;
    execute(
      input: TemporalDomainPluginInput,
      context: TemporalPluginContext,
    ): Promise<TemporalDomainPluginOutput>;
  };
  'plugin:verify': {
    readonly name: 'plugin:verify';
    readonly phase: 'phase:verify';
    readonly config: { sampleRate: number };
    readonly inputSchema: (value: unknown) => value is TemporalDomainPluginInput;
    execute(
      input: TemporalDomainPluginInput,
      context: TemporalPluginContext,
    ): Promise<TemporalDomainPluginOutput>;
  };
};

export type DomainStage = (typeof domainStages)[number];

export const phaseRank: Record<TemporalPhase, number> = {
  ingest: 1,
  validate: 2,
  simulate: 3,
  execute: 4,
  verify: 5,
};

export const phaseFromName = (value: string): TemporalPhase => {
  if (value.includes('validate')) {
    return 'validate';
  }
  if (value.includes('simulate')) {
    return 'simulate';
  }
  if (value.includes('execute')) {
    return 'execute';
  }
  if (value.includes('verify')) {
    return 'verify';
  }
  return 'ingest';
};

export const createDomainRegistry = async (): Promise<
  TemporalPluginRegistry<RegistryPluginMap>
> => {
  const registry = new TemporalPluginRegistry<RegistryPluginMap>([
    {
      name: 'plugin:ingest',
      phase: 'phase:ingest',
      config: { channel: 'kafka', tenant: 'system' },
      inputSchema(value): value is TemporalDomainPluginInput {
        return (
          typeof value === 'object' && value !== null && 'tenant' in value && 'runbook' in value && 'scope' in value
        );
      },
      async execute(input, context): Promise<TemporalDomainPluginOutput> {
        const signal: OrchestrationSignal<'domain', { stage: string; emittedBy: string }> = {
          signalId: `sig:${Math.random().toString(36).slice(2)}` as EntityId,
          type: 'signal:domain',
          issuedAt: isoNow(),
          runId: context.runId,
          ttlMs: 30_000,
          severity: 'low',
          payload: {
            stage: 'ingest',
            emittedBy: this['name'] ?? 'n/a',
          },
        };

        const runbook: TemporalRunbook = {
          ...input.runbook,
          nodes: [
            ...input.runbook.nodes,
            {
              id: asStageId(context.runId, 'ingest'),
              kind: 'timeline:ingest' as Brand<string, 'TimelineNodeKind'>,
              tenant: input.tenant,
              name: 'ingest',
              state: 'complete',
              phase: 'ingest',
              payload: signal,
              startedAt: isoNow(),
              completedAt: isoNow(),
              dependsOn: [],
              errors: [],
            },
          ],
        };

        return {
          tenant: input.tenant,
          runbook,
          signals: [signal],
        };
      },
    },
    {
      name: 'plugin:validate',
      phase: 'phase:validate',
      config: { strict: true },
      inputSchema(value): value is TemporalDomainPluginInput {
        return (
          typeof value === 'object' && value !== null && 'tenant' in value && 'runbook' in value && 'scope' in value
        );
      },
      async execute(input, context): Promise<TemporalDomainPluginOutput> {
        const signal: OrchestrationSignal<'domain', { stage: string; strict: boolean }> = {
          signalId: `sig:${Math.random().toString(36).slice(2)}` as EntityId,
          type: 'signal:domain',
          issuedAt: isoNow(),
          runId: context.runId,
          ttlMs: 30_000,
          severity: 'low',
          payload: {
            stage: 'validate',
            strict: this.config.strict,
          },
        };

        const runbook: TemporalRunbook = {
          ...input.runbook,
          nodes: [
            ...input.runbook.nodes,
            {
              id: asStageId(context.runId, 'validate'),
              kind: 'timeline:validate' as Brand<string, 'TimelineNodeKind'>,
              tenant: input.tenant,
              name: 'validate',
              state: 'complete',
              phase: 'validate',
              payload: { input },
              startedAt: isoNow(),
              completedAt: isoNow(),
              dependsOn: [asStageId(context.runId, 'ingest')],
              errors: [],
            },
          ],
        };

        return {
          tenant: input.tenant,
          runbook,
          signals: [signal],
        };
      },
    },
    {
      name: 'plugin:simulate',
      phase: 'phase:simulate',
      config: { seed: 'default' },
      inputSchema(value): value is TemporalDomainPluginInput {
        return (
          typeof value === 'object' && value !== null && 'tenant' in value && 'runbook' in value && 'scope' in value
        );
      },
      async execute(input, context): Promise<TemporalDomainPluginOutput> {
        const signal: OrchestrationSignal<'domain', { stage: string; seed: string }> = {
          signalId: `sig:${Math.random().toString(36).slice(2)}` as EntityId,
          type: 'signal:domain',
          issuedAt: isoNow(),
          runId: context.runId,
          ttlMs: 30_000,
          severity: 'medium',
          payload: {
            stage: 'simulate',
            seed: this.config.seed,
          },
        };

        const simulationNode = {
          id: asStageId(context.runId, 'simulate'),
          kind: 'timeline:simulate' as Brand<string, 'TimelineNodeKind'>,
          tenant: input.tenant,
          name: 'simulate',
          state: 'complete',
          phase: 'simulate',
          payload: signal,
          startedAt: isoNow(),
          completedAt: isoNow(),
          dependsOn: [asStageId(context.runId, 'validate')],
          errors: [],
        } satisfies TimelineNode;

        return {
          tenant: input.tenant,
          runbook: {
            ...input.runbook,
            nodes: [...input.runbook.nodes, simulationNode],
          },
          signals: [signal],
        };
      },
    },
    {
      name: 'plugin:execute',
      phase: 'phase:execute',
      config: { concurrency: 4 },
      inputSchema(value): value is TemporalDomainPluginInput {
        return (
          typeof value === 'object' && value !== null && 'tenant' in value && 'runbook' in value && 'scope' in value
        );
      },
      async execute(input, context): Promise<TemporalDomainPluginOutput> {
        const signal: OrchestrationSignal<'domain', { stage: string; concurrency: number }> = {
          signalId: `sig:${Math.random().toString(36).slice(2)}` as EntityId,
          type: 'signal:domain',
          issuedAt: isoNow(),
          runId: context.runId,
          ttlMs: 30_000,
          severity: 'critical',
          payload: {
            stage: 'execute',
            concurrency: this.config.concurrency,
          },
        };

        const executeNode: TimelineNode = {
          id: asStageId(context.runId, 'execute'),
          kind: 'timeline:execute' as Brand<string, 'TimelineNodeKind'>,
          tenant: input.tenant,
          name: 'execute',
          state: 'complete',
          phase: 'execute',
          payload: signal,
          startedAt: isoNow(),
          completedAt: isoNow(),
          dependsOn: [asStageId(context.runId, 'simulate')],
          errors: [],
        };

        return {
          tenant: input.tenant,
          runbook: {
            ...input.runbook,
            nodes: [...input.runbook.nodes, executeNode],
            metadata: {
              ...(input.runbook.metadata as Record<string, unknown>),
              executedAt: isoNow(),
            },
          },
          signals: [signal],
        };
      },
    },
    {
      name: 'plugin:verify',
      phase: 'phase:verify',
      config: { sampleRate: 0.8 },
      inputSchema(value): value is TemporalDomainPluginInput {
        return (
          typeof value === 'object' && value !== null && 'tenant' in value && 'runbook' in value && 'scope' in value
        );
      },
      async execute(input, context): Promise<TemporalDomainPluginOutput> {
        const signal: OrchestrationSignal<'domain', { stage: string; sampleRate: number; valid: boolean }> = {
          signalId: `sig:${Math.random().toString(36).slice(2)}` as EntityId,
          type: 'signal:domain',
          issuedAt: isoNow(),
          runId: context.runId,
          ttlMs: 30_000,
          severity: 'low',
          payload: {
            stage: 'verify',
            sampleRate: this.config.sampleRate,
            valid: Math.random() < this.config.sampleRate,
          },
        };

        const verifyNode: TimelineNode = {
          id: asStageId(context.runId, 'verify'),
          kind: 'timeline:verify' as Brand<string, 'TimelineNodeKind'>,
          tenant: input.tenant,
          name: 'verify',
          state: 'complete',
          phase: 'verify',
          payload: signal,
          startedAt: isoNow(),
          completedAt: isoNow(),
          dependsOn: [asStageId(context.runId, 'execute')],
          errors: [],
        };

        return {
          tenant: input.tenant,
          runbook: {
            ...input.runbook,
            nodes: [...input.runbook.nodes, verifyNode],
          },
          signals: [signal],
        };
      },
    },
  ]);

  return registry;
};

export const runPhasesFromRegistry = async (
  registry: TemporalPluginRegistry<RegistryPluginMap>,
  input: TemporalDomainPluginInput,
): Promise<TemporalDomainPluginOutput[]> => {
  const ordered = registry
    .manifests()
    .toSorted((left, right) => phaseRank[phaseFromName(left.phase)] - phaseRank[phaseFromName(right.phase)]);

  const context: TemporalPluginContext = {
    runId: `run:${Math.random().toString(36).slice(2)}` as Brand<string, 'RunId'>,
    tenant: input.tenant,
    at: isoNow(),
  };

  const outputs: TemporalDomainPluginOutput[] = [];
  let current = input;

  for (const item of ordered) {
    const candidateName = item.key as PluginName<RegistryPluginMap>;
    const output = await registry.run(candidateName, current as never, context);
    const enrichedInput: TemporalDomainPluginInput = {
      tenant: output.tenant,
      scope: input.scope,
      runbook: output.runbook,
    };
    outputs.push(output);
    current = enrichedInput;
  }

  return outputs;
};

export const registrySupports = <TName extends DomainStage>(name: TName, value: string): value is TName => {
  return isTemporalKind(name, value);
};
