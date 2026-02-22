import { RecoveryDrillObserverConsole } from './commands';

export interface ConsoleRunInput {
  readonly tenant: string;
  readonly runId: string;
  readonly events: readonly unknown[];
}

export const runRecoverObserverDemo = async (input: ConsoleRunInput): Promise<{
  commandResultCount: number;
}> => {
  const console = new RecoveryDrillObserverConsole();
  let commandResultCount = 0;

  for (const event of input.events) {
    await console.execute({
      command: 'ingest',
      runId: input.runId,
      payload: event,
    });
    commandResultCount += 1;
  }

  await console.execute({ command: 'query', tenant: input.tenant });
  await console.execute({ command: 'snapshot', tenant: input.tenant });

  return { commandResultCount };
};
