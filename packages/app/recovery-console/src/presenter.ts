import type { Result } from '@shared/result';
import { isOk } from '@shared/result';

import { RecoveryOrchestrator } from '@service/recovery-runner';

export interface RecoveryPresentation {
  text: string;
  severity: 'info' | 'warn' | 'error';
}

export const presentResult = (result: Result<unknown, Error>, message: string): RecoveryPresentation => {
  if (!isOk(result)) {
    return {
      text: `${message}: ${result.error.message}`,
      severity: 'error',
    };
  }
  return {
    text: `${message} ok`,
    severity: 'info',
  };
};

export const presentOrchestrator = (orchestrator: RecoveryOrchestrator) => ({
  status: typeof orchestrator,
  healthy: true,
});
