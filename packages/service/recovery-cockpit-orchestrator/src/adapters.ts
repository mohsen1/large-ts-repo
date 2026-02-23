import { RecoveryAction } from '@domain/recovery-cockpit-models';

export type AttemptResult = {
  readonly commandId: string;
  readonly ok: boolean;
  readonly reason?: string;
};

export type RunEvent = {
  readonly actionId: string;
  readonly phase: 'dispatch' | 'retry' | 'final';
  readonly timestamp: string;
};

export const tagForAction = (action: RecoveryAction): string => `${action.serviceCode}:${action.region}:${action.command}`;

export const executeWithRetries = async (
  action: RecoveryAction,
  dispatch: (action: RecoveryAction) => Promise<AttemptResult>,
  maxRetries: number,
): Promise<AttemptResult[]> => {
  const events: AttemptResult[] = [];
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const event = await dispatch(action);
    events.push(event);
    if (event.ok) {
      break;
    }
  }
  return events;
};

export const toRunEvents = (action: RecoveryAction): RunEvent => ({
  actionId: action.id,
  phase: 'dispatch',
  timestamp: new Date().toISOString(),
});
