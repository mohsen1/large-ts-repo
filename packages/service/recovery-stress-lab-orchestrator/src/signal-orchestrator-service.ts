import { NoInfer } from '@shared/type-level';
import {
  type TenantId,
  type SeverityBand,
  type WorkloadTopology,
  type WorkloadTarget,
  type RecoverySignal,
  type OrchestrationPlan,
  type RecoverySimulationResult,
  type RecoverySignalId,
  createRunbookId,
  createSignalId,
} from '@domain/recovery-stress-lab';
import { InMemoryPersistence, ConsoleAuditSink } from '@domain/recovery-stress-lab';
import { buildDecisionFromInput, persistDecision, buildSession } from './adapters';
import { runSignalChain, type SignalChainEvent } from './signal-orchestration-registry';

const defaultBanner = 'recovery:stress-lab-orchestrator@2026.02';

export interface SignalOrchestratorInput {
  readonly tenantId: TenantId;
  readonly topology: WorkloadTopology;
  readonly band: SeverityBand;
  readonly selectedRunbooks: readonly string[];
  readonly selectedSignals: readonly RecoverySignal[];
  readonly rawSignals: readonly unknown[];
  readonly targets: readonly WorkloadTarget[];
}

export interface SignalOrchestratorOutput {
  readonly tenantId: TenantId;
  readonly banner: string;
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly commandCount: number;
  readonly preferredBands: readonly SeverityBand[];
  readonly chain: {
    readonly digest: string;
    readonly signalCount: number;
    readonly events: readonly SignalChainEvent[];
  };
}

const resolveRunbookIds = (runbooks: readonly string[]) => {
  return [...new Set(runbooks)].map((id) => createRunbookId(id));
};

export const runSignalOrchestrator = async (
  input: NoInfer<SignalOrchestratorInput>,
): Promise<SignalOrchestratorOutput> => {
  const preferredBands = dedupeBands([input.band, 'critical']);
  const chainResult = await runSignalChain({
    tenantId: input.tenantId,
    topology: input.topology,
    rawSignals: input.rawSignals,
    preferredBands,
  });

  const selectedRunbookIds = resolveRunbookIds(input.selectedRunbooks);
  const draft = {
    name: `${input.tenantId}-${Date.now()}`,
    description: `runtime orchestration for ${defaultBanner}`,
    band: input.band,
    selectedSignals: input.selectedSignals.map((signal) => signal.id as RecoverySignalId),
    selectedRunbookIds,
  };

  const decision = buildDecisionFromInput({
    tenantId: input.tenantId,
    draft,
    config: {
      tenantId: input.tenantId,
      band: input.band,
      profileHint: input.band === 'critical' ? 'agile' : 'normal',
      selectedRunbooks: selectedRunbookIds,
    },
    runbooks: input.selectedRunbooks.map((runbookId) => ({
      id: runbookId,
      title: runbookId,
      steps: [],
      cadence: {
        weekday: 1,
        windowStartMinute: 0,
        windowEndMinute: 60,
      },
    })),
    targets: input.targets,
    topology: input.topology,
    signals: input.selectedSignals,
  });

  const persistence = new InMemoryPersistence();
  const audit = new ConsoleAuditSink();

  await persistDecision(
    {
      persistence,
      audit,
    },
    input.tenantId,
    decision,
  );

  const session = buildSession(input.tenantId, decision);
  const chainDigest = chainResult.chain.digest;
  const eventLog = [
    `tenant=${input.tenantId}`,
    `nodes=${input.topology.nodes.length}`,
    `edges=${input.topology.edges.length}`,
    `signals=${input.selectedSignals.length}`,
    `commands=${session.commands.length}`,
  ];

  const commandCount = session.commands.length;
  if (session.commands.length > 0) {
    const simulation = session.commands[0] ?? null;
    void simulation;
  }

  return {
    tenantId: input.tenantId,
    banner: defaultBanner,
    plan: decision.plan,
    simulation: decision.simulation,
    commandCount,
    preferredBands,
    chain: {
      digest: chainDigest,
      signalCount: chainResult.chain.signalIds.length,
      events: chainResult.events,
    },
  };
};

const dedupeBands = (bands: readonly SeverityBand[]): readonly SeverityBand[] => {
  return [...new Set(bands)] as SeverityBand[];
};

export const expandRunbookSignals = (selectedRunbooks: readonly string[]): readonly RecoverySignalId[] => {
  return selectedRunbooks.map((runbookId) => createSignalId(`signal:${runbookId}`));
};

export const summarizeSignalOrchestrator = (output: SignalOrchestratorOutput): string => {
  return `${output.tenantId}|${output.banner}|${output.plan?.scenarioName ?? 'no-plan'}|${output.chain.signalCount}`;
};

export const runSignalOrchestratorBatches = async (
  inputs: readonly SignalOrchestratorInput[],
): Promise<readonly SignalOrchestratorOutput[]> => {
  const output = inputs.map((input) => runSignalOrchestrator(input));
  return Promise.all(output);
};

export type SignalOrchestratorTuple =
  | readonly [SignalOrchestratorInput]
  | readonly [SignalOrchestratorInput, SignalOrchestratorInput]
  | readonly [SignalOrchestratorInput, SignalOrchestratorInput, SignalOrchestratorInput];

export const runSignalOrchestratorTuple = async <
  const TTuple extends SignalOrchestratorTuple,
>(batch: NoInfer<TTuple>): Promise<{
  readonly outputs: {
    readonly [K in keyof TTuple]: SignalOrchestratorOutput;
  };
}> => {
  const outputs = (await runSignalOrchestratorBatches(batch)) as {
    readonly [K in keyof TTuple]: SignalOrchestratorOutput;
  };
  return { outputs };
};
