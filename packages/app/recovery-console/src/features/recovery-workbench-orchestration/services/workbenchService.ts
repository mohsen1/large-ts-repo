import { type WorkbenchRunInput, type WorkbenchRunOutput } from '@domain/recovery-workbench-models';
import {
  RecoveryWorkbenchOrchestrator,
  createOrchestrator,
  type RecoveryOrchestratorConfig,
} from '@service/recovery-workbench-orchestrator';
import { bootstrap } from '@service/recovery-workbench-orchestrator/bootstrap';
import type { WorkbenchPluginResult } from '../types';

interface WorkbenchSession {
  readonly sessionId: string;
  readonly orchestrator: RecoveryWorkbenchOrchestrator;
}

interface WorkbenchRunError {
  readonly message: string;
  readonly code: 'E_EXEC' | 'E_ROUTING';
}

type WorkbenchRunSuccess = {
  readonly kind: 'success';
  readonly output: WorkbenchRunOutput;
  readonly error?: undefined;
};

type WorkbenchRunFailure = {
  readonly kind: 'failure';
  readonly output?: undefined;
  readonly error: WorkbenchRunError;
};

export type WorkbenchExecutionResult = WorkbenchRunSuccess | WorkbenchRunFailure;

const createSession = (config: RecoveryOrchestratorConfig): WorkbenchSession => ({
  sessionId: `${config.tenantId}-${config.workspaceId}`,
  orchestrator: createOrchestrator(config),
});

export const makeWorkbenchSession = (): WorkbenchSession =>
  createSession({
    tenantId: bootstrap.tenantId,
    workspaceId: bootstrap.workspaceId,
    catalog: bootstrap.catalog,
    profile: bootstrap.profile,
  });

export const runWorkbench = async (input: WorkbenchRunInput): Promise<WorkbenchExecutionResult> => {
  const session = makeWorkbenchSession();
  const run = await session.orchestrator.run(input);

  if (!run.output || run.error) {
    await session.orchestrator.close();
    return {
      kind: 'failure',
      error: {
        code: run.error instanceof Error ? 'E_EXEC' : 'E_ROUTING',
        message: run.error ? run.error.message : 'orchestrator run produced no output',
      },
    };
  }

  await session.orchestrator.close();
  return {
    kind: 'success',
    output: run.output,
  };
};

export const normalizePluginTrace = (output: WorkbenchRunOutput): readonly WorkbenchPluginResult[] =>
  output.traces
    .map((trace) => ({
      id: trace.pluginId as string,
      name: trace.pluginName,
      route: trace.route as WorkbenchPluginResult['route'],
      value: trace.output,
      confidence: trace.confidence,
      latencyMs: trace.latencyMs,
    }))
    .filter((entry) => entry.value.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry, index, entries) => {
      const dashIndex = entries[index].id.indexOf('-');
      if (dashIndex < 0) {
        return entry;
      }
      return {
        ...entry,
        name: `${entry.name}[${dashIndex}]`,
      };
    });
