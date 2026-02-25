import { NoInfer } from '@shared/type-level';
import { type TenantId, type WorkloadTopology, type WorkloadTarget, type RecoverySignal } from '@domain/recovery-stress-lab';
import {
  runSignalOrchestrator,
  type SignalOrchestratorInput,
  type SignalOrchestratorOutput,
} from './signal-orchestrator-service';

export interface RunnerContext {
  readonly tenantId: TenantId;
  readonly topology: WorkloadTopology;
  readonly targets: readonly WorkloadTarget[];
}

export interface RunnerInput extends RunnerContext {
  readonly selectedRunbooks: readonly string[];
  readonly selectedSignals: readonly RecoverySignal[];
  readonly rawSignals: readonly unknown[];
  readonly band: 'low' | 'medium' | 'high' | 'critical';
}

export interface RunnerOutput {
  readonly context: RunnerContext;
  readonly output: SignalOrchestratorOutput;
}

const buildInput = (input: NoInfer<RunnerInput>): SignalOrchestratorInput => ({
  tenantId: input.tenantId,
  topology: input.topology,
  band: input.band,
  selectedRunbooks: input.selectedRunbooks,
  selectedSignals: input.selectedSignals,
  rawSignals: input.rawSignals,
  targets: input.targets,
});

export const runSignalRunner = async (input: NoInfer<RunnerInput>): Promise<RunnerOutput> => {
  const output = await runSignalOrchestrator(buildInput(input));
  return {
    context: {
      tenantId: input.tenantId,
      topology: input.topology,
      targets: input.targets,
    },
    output,
  };
};

export const runSignalBatch = async (
  inputs: readonly RunnerInput[],
): Promise<readonly RunnerOutput[]> => {
  return Promise.all(inputs.map((entry) => runSignalRunner(entry)));
};

export const runSignalBatchFromBands = async (
  tenantId: TenantId,
  topology: WorkloadTopology,
  bands: readonly RunnerInput['band'][],
): Promise<readonly RunnerOutput[]> => {
  const runbooks = ['runbook:drain', 'runbook:restore', 'runbook:rollback'];
  const signals: RecoverySignal[] = [];

  return Promise.all(
    bands.map((band) =>
      runSignalRunner({
        tenantId,
        topology,
        selectedRunbooks: runbooks,
        selectedSignals: signals,
        rawSignals: signals,
        targets: [],
        band,
      }),
    ),
  );
};
