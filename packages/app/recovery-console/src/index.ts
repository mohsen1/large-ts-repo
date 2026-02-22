import { EventBridgeClient } from '@aws-sdk/client-eventbridge';

import { parseRecoveryProgram } from '@domain/recovery-orchestration';
import {
  type RecoveryRunRepository,
  InMemoryRecoveryArtifactRepository,
} from '@data/recovery-artifacts';
import { EventBridgeRecoveryNotifier } from '@infrastructure/recovery-notifications';
import { RecoveryOrchestrator } from '@service/recovery-runner';
import { presentResult, presentOrchestrator } from './presenter';
import { RecoveryCommand } from './commands';

const parse = (input: unknown) => {
  return RecoveryCommand.parse(input);
};

export const runRecoveryWorkflow = async (
  programPayload: unknown,
  commandPayload: unknown,
  runRepository: RecoveryRunRepository,
  eventBus: string
) => {
  const program = parseRecoveryProgram(programPayload);
  const command = parse(commandPayload);
  const notifier = new EventBridgeRecoveryNotifier(eventBus, new EventBridgeClient({}));
  const artifactRepo = new InMemoryRecoveryArtifactRepository();
  const orchestrator = new RecoveryOrchestrator({
    runRepository,
    artifactRepository: artifactRepo,
    notifier,
  });

  if (command.type === 'start') {
    const result = await orchestrator.initiateRecovery(program, {
      command: 'start',
      requestedBy: command.requestedBy,
      correlationId: command.correlationId,
    });
    return { presentation: presentResult(result, 'recovery-run-started'), orchestrator: presentOrchestrator(orchestrator) };
  }

  if (command.type === 'status') {
    const status = await orchestrator.reviewRecentProgress(command.runId as any);
    return { presentation: presentResult(status, 'recovery-run-status'), orchestrator: presentOrchestrator(orchestrator) };
  }

  const close = await orchestrator.closeRun(command.runId as any);
  return { presentation: presentResult(close, 'recovery-run-closed'), orchestrator: presentOrchestrator(orchestrator) };
};

export * from './hooks/useRecoverySimulationWorkspace';
export * from './hooks/useRecoveryConsoleTelemetry';
export * from './components/RecoveryOperationsControlPanel';
export * from './components/SimulationScenarioBoard';
export * from './components/ScenarioRiskHeatmap';
export * from './pages/RecoverySimulationWorkspacePage';
export * from './pages/RecoverySimulationHistoryPage';
export * from './pages/RecoveryOperationsCenterPage';
