import {
  canonicalizeNamespace,
  type PluginKind,
  type PluginNamespace,
} from '@shared/stress-lab-runtime/ids';
import {
  buildSnapshot,
  defaultCatalog,
  resolveCatalogDependencyGraph,
  runCatalogSeedSafe,
  type WorkbenchChainInput,
} from '@shared/stress-lab-runtime/plugin-catalog-extensions';
import { type ChainEvent, executeTypedChain } from '@shared/stress-lab-runtime/plugin-chain-executor';
import {
  createRunbookId,
  createSignalId,
  createTenantId,
  type CommandRunbookId,
  type RecoverySignalId,
  type TenantId,
  type WorkloadTopology,
} from './models';
import {
  inferSignalsFromTopology,
  buildWorkspacePlan,
  buildDraft,
  type WorkbenchFixture,
  type WorkbenchMode,
} from './stress-lab-workbench';
import { z } from 'zod';

export type StageStatus = 'idle' | 'planning' | 'running' | 'completed' | 'failed';
export type StagePhase = 'plan' | 'shape' | 'simulate' | 'recommend' | 'report';

export type StageTransition<TPhase extends StagePhase = StagePhase> = `${TPhase}->${Exclude<StagePhase, TPhase>}`;

export type StageChainTuple<T extends readonly StagePhase[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head & StagePhase, ...StageChainTuple<Tail & readonly StagePhase[]>]
  : readonly [];

export interface OrchestrationInput {
  readonly tenantId: TenantId;
  readonly workloadTopology: WorkloadTopology;
  readonly selectedRunbooks: readonly CommandRunbookId[];
  readonly selectedSignals: readonly RecoverySignalId[];
}

export interface OrchestratorSignalBundle {
  readonly topology: WorkloadTopology;
  readonly runbookCount: number;
  readonly signalCount: number;
}

export interface OrchestrationOutput {
  readonly runId: string;
  readonly tenantId: TenantId;
  readonly catalogNamespace: PluginNamespace;
  readonly chain: {
    readonly ok: boolean;
    readonly traces: readonly ChainEvent[];
  };
  readonly phase: StagePhase;
}

export interface OrchestrationAdapter {
  execute(input: OrchestrationInput): Promise<OrchestrationOutput>;
}

const OrchestratorPhases = ['plan', 'shape', 'simulate', 'recommend', 'report'] as const satisfies readonly StagePhase[];

const modeToPhase = (mode: WorkbenchMode): StagePhase => (mode === 'recommend' ? 'recommend' : mode === 'simulate' ? 'simulate' : mode === 'report' ? 'report' : 'plan');

const summarizeInput = (input: OrchestrationInput): OrchestratorSignalBundle => ({
  topology: input.workloadTopology,
  runbookCount: input.selectedRunbooks.length,
  signalCount: input.selectedSignals.length,
});

const deriveFixture = (input: OrchestrationInput, mode: WorkbenchMode): WorkbenchFixture => ({
  tenantId: input.tenantId,
  scenario: `tenant:${input.tenantId}:stress-lab`,
  selectedRunbooks: input.selectedRunbooks,
  selectedSignals: input.selectedSignals,
  mode,
});

export class StressLabOrchestratorControl implements OrchestrationAdapter {
  readonly tenantId: TenantId;
  readonly namespace: PluginNamespace;
  readonly createdAt = new Date().toISOString();
  readonly #catalogNamespace: PluginNamespace;
  #state: StageStatus = 'idle';

  constructor(tenantId: string) {
    this.tenantId = createTenantId(tenantId);
    this.namespace = canonicalizeNamespace(`recovery/stress-lab/${tenantId}`);
    this.#catalogNamespace = canonicalizeNamespace('recovery:stress:lab:catalog');
  }

  get state(): StageStatus {
    return this.#state;
  }

  async execute(input: OrchestrationInput): Promise<OrchestrationOutput> {
    this.#state = 'planning';

    const snapshot = await buildSnapshot(defaultCatalog);
    const graph = resolveCatalogDependencyGraph(snapshot.catalog);
    const inferred = summarizeInput(input);
    const inferredMode = inferred.runbookCount > 0 && inferred.signalCount >= 2 ? 'recommend' : 'plan';
    const fixture = deriveFixture(input, inferredMode);

    const runbooks = input.selectedRunbooks.map((runbookId, index) => {
      const runbookSeed = {
        id: runbookId,
        tenantId: fixture.tenantId,
        name: `Runbook ${index + 1}`,
        description: 'Synthetic stress-lab orchestrator runbook',
        steps: [],
        ownerTeam: 'stress-lab',
        cadence: {
          weekday: 1,
          windowStartMinute: 0,
          windowEndMinute: 1440,
        },
      };
      return runbookSeed;
    });

    const plan = await buildWorkspacePlan(fixture);
    const draft = buildDraft(fixture.tenantId, fixture.scenario, runbooks, plan.routingTable);
    const chainInput: WorkbenchChainInput = {
      tenantId: String(input.tenantId),
      scenario: fixture.scenario,
      topology: input.workloadTopology,
      selectedRunbooks: input.selectedRunbooks,
      selectedSignals: input.selectedSignals,
      recommendations: draft.runbookIds,
      route: [fixture.mode, ...plan.runbookIds.slice(0, OrchestratorPhases.length).map(String)],
      traceCount: draft.runbookFingerprint.length,
      selectedSignalIds: inferSignalsFromTopology(inferred.topology).map((signal) => signal.id),
    };

    this.#state = 'running';
    const chain = await executeTypedChain<typeof snapshot.catalog, WorkbenchChainInput>(
      String(input.tenantId),
      snapshot.catalog,
      chainInput,
    );
    this.#state = chain.ok ? 'completed' : 'failed';

    const phase: StagePhase = graph.tags.includes('recommend') ? 'recommend' : modeToPhase(fixture.mode);
    const outputId = `${fixture.tenantId}:${fixture.scenario}:${graph.ordered.length}:${chain.traces.length}`;

    return {
      runId: outputId,
      tenantId: fixture.tenantId,
      catalogNamespace: this.#catalogNamespace,
      chain: {
        ok: chain.ok,
        traces: chain.traces.map((entry) => ({
          ...entry,
          pluginId: `${entry.pluginId}` as const,
          message: `${entry.message}`,
          status: entry.status,
        })),
      },
      phase,
    };
  }

  async audit(): Promise<readonly string[]> {
    return Promise.all(
      OrchestratorPhases.map(async (phase, index) => {
        const probe = await runCatalogSeedSafe({
          name: `orchestrator-${phase}`,
          kind: `stress-lab/${phase}` as PluginKind,
          tags: ['phase'],
          dependencies: [],
          namespace: String(this.namespace),
          version: [1, 0, 0],
          config: { index, phase, namespace: String(this.namespace) },
          runner: async () => ({
            ok: true,
            value: {
              tenantId: String(this.tenantId),
              stage: `stress-lab/${phase}` as PluginKind,
              generatedAtTag: `probe:${index}`,
              route: [phase],
              topology: [],
            },
            generatedAt: new Date().toISOString(),
          }),
        });
        return `${phase}:${probe.ok ? 'ok' : 'fail'}`;
      }),
    );
  }
}

export interface OrchestratorContext {
  readonly tenantId: TenantId;
  readonly phases: StagePhase[];
  readonly input: OrchestrationInput;
}

export const createOrchestratorContext = (input: OrchestrationInput): OrchestratorContext => ({
  tenantId: input.tenantId,
  phases: [...OrchestratorPhases],
  input,
});

export const createOrchestrator = (tenantId: string): OrchestrationAdapter => new StressLabOrchestratorControl(tenantId);

export const buildOrchestratorRunId = (
  tenantId: TenantId,
  phase: StagePhase,
  sequence: StageChainTuple<typeof OrchestratorPhases>,
): string => `${tenantId}:${phase}:${sequence.join('>')}:${sequence.length}`;

export const createOrchestratorRunSuffix = <T extends readonly StagePhase[]>(sequence: T): string =>
  sequence.map((entry, index) => `${entry[0]}${index}`).join('|');

const safeInputSchema = z.object({
  tenantId: z.string().min(1),
  topology: z.unknown(),
  selectedRunbookIds: z.array(z.string().min(1)),
  selectedSignalIds: z.array(z.string().min(1)),
  mode: z.enum(['plan', 'simulate', 'recommend', 'report']).default('plan'),
});

export const executeOrchestratorSafe = async (input: {
  tenantId: string;
  topology: unknown;
  selectedRunbooks: readonly string[];
  selectedSignals: readonly string[];
  mode?: WorkbenchMode;
}): Promise<OrchestrationOutput> => {
  const parsed = safeInputSchema.parse(input);

  const normalized: OrchestrationInput = {
    tenantId: createTenantId(parsed.tenantId),
    workloadTopology: parsed.topology as WorkloadTopology,
    selectedRunbooks: parsed.selectedRunbookIds.map((id) => createRunbookId(id)),
    selectedSignals: parsed.selectedSignalIds.map((id) => createSignalId(id)),
  };

  const orchestrator = createOrchestrator(parsed.tenantId);
  return orchestrator.execute(normalized);
};
