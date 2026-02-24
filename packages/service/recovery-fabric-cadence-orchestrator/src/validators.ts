import type { CadenceCommand } from '@domain/recovery-fabric-cadence-core';
import { fail, ok, type Result } from '@shared/result';
import type { OrchestratorError } from './types';

export const validateCommand = (command: CadenceCommand): Result<void, OrchestratorError> => {
  if (!command.planId) {
    return fail({ code: 'invalid-command', message: 'planId is required' });
  }
  if (command.requestedThroughput <= 0) {
    return fail({ code: 'invalid-command', message: 'requestedThroughput must be positive' });
  }
  if (!command.operatorId) {
    return fail({ code: 'invalid-command', message: 'operatorId missing' });
  }
  if (!command.requestedSignalIds.length) {
    return fail({ code: 'invalid-command', message: 'requestedSignalIds required' });
  }
  return ok(undefined);
};

export const validatePlanId = (planId: string): Result<void, OrchestratorError> => {
  if (!planId.startsWith('plan:')) {
    return fail({ code: 'validation-failed', message: 'planId must use plan namespace' });
  }
  return ok(undefined);
};

export const classifyCommand = (command: CadenceCommand): 'burst' | 'stitch' | 'drain' => command.mode;

export const commandWindowCount = (command: CadenceCommand): number => command.requestedSignalIds.length;
