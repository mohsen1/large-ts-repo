import { CommandEvent, RecoveryAction } from '@domain/recovery-cockpit-models';
import { executeWithRetries, tagForAction, AttemptResult } from './adapters';
import { OrchestratorConfig, ExternalAdapter } from './ports';

export type AdapterResult = {
  readonly actionId: string;
  readonly commandId?: string;
  readonly attempts: number;
  readonly status: CommandEvent['status'];
  readonly message?: string;
};

export type AdapterContext = {
  readonly retries: number;
  readonly dryRun: boolean;
  readonly startedAt: string;
};

export const createAdapterContext = (config: OrchestratorConfig): AdapterContext => ({
  retries: config.retryPolicy.maxRetries,
  dryRun: config.policyMode !== 'enforce',
  startedAt: new Date().toISOString(),
});

export const executeActionWithContext = async (
  adapter: ExternalAdapter,
  action: RecoveryAction,
  context: AdapterContext,
): Promise<AdapterResult> => {
  const startTag = tagForAction(action);
  const attempts = await executeWithRetries(
    action,
    async (actionToDispatch) => {
      if (context.dryRun && adapter.dryRun) {
        return adapter.dryRun(actionToDispatch)
          .then((result) => ({ ok: true, commandId: result.commandId, reason: `eta:${result.etaMinutes}` }));
      }
      try {
        const result = await adapter.dispatch(actionToDispatch);
        return { ok: true, commandId: result.commandId };
      } catch (error) {
        return { ok: false, commandId: `${actionToDispatch.id}:retry`, reason: (error as Error).message };
      }
    },
    context.retries,
  );

  const finalAttempt: AttemptResult | undefined = attempts.at(-1);
  const commandId = finalAttempt?.commandId;

  return {
    actionId: startTag,
    commandId,
    attempts: attempts.length,
    status: finalAttempt?.ok ? 'completed' : 'failed',
    message: finalAttempt?.reason,
  };
};
