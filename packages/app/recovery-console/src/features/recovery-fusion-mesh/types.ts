import type { MeshPhase, MeshRun, MeshSignalEnvelope, MeshTopology } from '@domain/recovery-fusion-intelligence';
import type { MeshOrchestrationOutput } from '@service/recovery-fabric-controller';

export interface RecoveryFusionMeshProps {
  readonly topology: MeshTopology;
  readonly signals: readonly MeshSignalEnvelope[];
}

export interface RecoveryFusionMeshState {
  readonly run: MeshRun | null;
  readonly output: MeshOrchestrationOutput | null;
  readonly isRunning: boolean;
  readonly signals: readonly MeshSignalEnvelope[];
  readonly error: string | null;
  readonly phases: readonly MeshPhase[];
}
