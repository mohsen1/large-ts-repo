import { fail, ok, type Result } from '@shared/result';
import type { ChaosStatus } from '@domain/recovery-chaos-lab';

export interface SignalBusMessage {
  readonly id: string;
  readonly namespace: string;
  readonly scenarioId: string;
  readonly stage: string;
  readonly status: ChaosStatus;
  readonly runId: string;
  readonly payload: unknown;
}

export function createRuntimeRegistryProfile(
  output: unknown,
  namespace: string,
  scenarioId: string,
  runId: string
): Result<unknown> {
  if (typeof namespace !== 'string' || typeof scenarioId !== 'string' || typeof runId !== 'string') {
    return fail(new Error('invalid registry context'));
  }

  const message: SignalBusMessage = {
    id: `${namespace}:${scenarioId}:${runId}`,
    namespace,
    scenarioId,
    stage: 'registry',
    status: 'active',
    runId,
    payload: output
  };

  return ok(message);
}
