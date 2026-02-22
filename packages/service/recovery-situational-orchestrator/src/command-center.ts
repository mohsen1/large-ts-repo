import { RecoverySituationalOrchestrator, runSituationalBatchPlanning, runSituationalPlanning } from './planner';
import type { OrchestrateRequest, OrchestrateResponse, CommandCenterState, CommandCenterSnapshot } from './types';

const orchestrator = new RecoverySituationalOrchestrator();

const createSnapshot = (request: OrchestrateRequest, mode: 'start' | 'batch'): CommandCenterSnapshot => ({
  request,
  mode: request.mode,
  requestStartedAt: new Date().toISOString(),
});

export const executeCommandCenter = async (request: OrchestrateRequest): Promise<OrchestrateResponse> => {
  const snapshot = createSnapshot(request, 'start');
  const response = await runSituationalPlanning(orchestrator, snapshot.request);
  return {
    ...response,
    persisted: true,
  };
};

export const executeCommandCenterBatch = async (
  requests: readonly OrchestrateRequest[],
): Promise<{ readonly responses: readonly OrchestrateResponse[]; readonly completedAt: string }> => {
  const snapshots = requests.map((request) => createSnapshot(request, 'batch'));
  const responses = await runSituationalBatchPlanning(
    orchestrator,
    snapshots.map((snapshot) => snapshot.request),
  );

  return {
    responses,
    completedAt: new Date().toISOString(),
  };
};

export const getCommandCenterState = (): CommandCenterState => {
  return {
    activeAssessmentIds: [],
    telemetry: {
      workloadNodeId: 'all',
      assessmentsCount: 0,
      activeSignals: 0,
      planCoverage: 0,
      averageConfidence: 0,
    },
  };
};

export const finalizeCommandCenter = async (assessmentId: string): Promise<void> => {
  await orchestrator.resolve(assessmentId);
};

export const refreshTelemetryPulse = async (nodeId: string) => orchestrator.summarize(nodeId);
