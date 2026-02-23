import { ok, fail, type Result } from '@shared/result';
import { ContinuityReadinessOrchestrator } from './orchestrator';
import type { ContinuityReadinessAdapters } from './adapters';
import { inMemoryAdapters } from './adapters';
import type { ContinuityReadinessTenantId } from '@domain/recovery-continuity-readiness';
import { ContinuityReadinessIds } from '@domain/recovery-continuity-readiness';

export interface ReadinessCommand {
  readonly tenantId: ContinuityReadinessTenantId;
  readonly tenantName: string;
  readonly surfaceId: string;
  readonly objective: string;
  readonly horizonMinutes: number;
}

const fallbackAdapters = (): ContinuityReadinessAdapters => ({
  gateway: {
    persistEnvelope: async () => ok(undefined),
    persistRun: async () => ok(undefined),
    announceSelection: async () => ok(undefined),
  },
  notifications: {
    notifyCritical: async () => ok(undefined),
  },
});

export const executeReadinessCommand = async (
  command: ReadinessCommand,
  adapters: ContinuityReadinessAdapters = fallbackAdapters(),
): Promise<Result<'executed' | 'skipped', Error>> => {
  const orchestrator = new ContinuityReadinessOrchestrator(adapters);
  const output = await orchestrator.run({
    ...command,
    surfaceId: ContinuityReadinessIds.surface(command.surfaceId),
    signals: [],
  });
  if (!output.ok) {
    return fail(output.error);
  }

  return ok('executed');
};

export interface ContinuityReadinessAdapter {
  name: string;
  run: typeof executeReadinessCommand;
}

export const buildReadinessAdapter = (name: string): ContinuityReadinessAdapter => ({
  name,
  run: executeReadinessCommand,
});

export const planReadinessRun = (command: ReadinessCommand): string =>
  `command tenant=${command.tenantId}, objective=${command.objective}, horizon=${command.horizonMinutes}`;
