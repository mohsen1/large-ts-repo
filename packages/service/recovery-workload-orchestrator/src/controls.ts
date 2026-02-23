import type { WorkloadRepository, WorkloadStoreQuery } from '@data/recovery-workload-store';
import type { OrchestratorMode, OrchestrationInput, WorkloadOrchestrator } from './types';
import type { WorkloadNode } from '@domain/recovery-workload-intelligence';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';

export interface ControlSignal {
  readonly nodeId: WorkloadNode['id'];
  readonly action: 'pause' | 'resume' | 'drain' | 'quiesce';
  readonly reason: string;
  readonly confidence: number;
  readonly issuedAt: string;
}

export interface ControlContext {
  readonly repository: WorkloadRepository;
  readonly mode: OrchestratorMode;
}

const isCritical = (value: number): boolean => value > 4;

export const buildControlSignals = (input: WorkloadStoreQuery, nodes: readonly WorkloadNode[]): ControlSignal[] => {
  return nodes
    .filter((node) => isCritical(node.criticality))
    .map((node) => ({
      nodeId: node.id,
      action: node.region === 'us-east-1' ? 'quiesce' : 'pause',
      reason: `criticality=${node.criticality} in ${node.region}`,
      confidence: 0.82 + (node.criticality * 0.03),
      issuedAt: new Date().toISOString(),
    }));
};

export const runControls = async ({ repository, mode }: ControlContext): Promise<Result<readonly ControlSignal[], string>> => {
  if (mode !== 'simulate' && mode !== 'drill') {
    return fail('controls not enabled for plan-only mode');
  }
  const records = await repository.query(inputFromMode(mode));
  if (records.length === 0) {
    return fail('no records for control generation');
  }
  const nodes = records.map((record) => record.node);
  const signals = buildControlSignals({ nodeIds: nodes.map((node) => node.id), includeDependencies: false }, nodes);
  return ok(signals);
};

const inputFromMode = (mode: OrchestratorMode): WorkloadStoreQuery => {
  return {
    nodeIds: [],
    includeDependencies: true,
    region: mode === 'drill' ? 'us-east-1' : undefined,
  };
};
