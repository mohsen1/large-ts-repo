import { InMemorySignalMeshStore } from '@data/recovery-cockpit-signal-mesh-store';
import type { MeshPlan, MeshExecutionPhase, MeshRunId } from '@domain/recovery-cockpit-signal-mesh';
import { SignalMeshOrchestrator, type OrchestratorConfig } from './meshOrchestrator';

export const createDefaultConfig = (tenant: string): OrchestratorConfig => ({
  tenant,
  region: 'global',
  phase: 'detect',
  telemetry: {
    enabled: true,
    flushWindowMs: 1_000,
    sampleRate: 1,
  },
});

export const runPlanImmediately = async (
  plan: MeshPlan,
  phase: MeshExecutionPhase,
): Promise<{ readonly runId: MeshRunId; readonly executed: number }> => {
  const config = createDefaultConfig(plan.tenant as string);
  const orchestrator = new SignalMeshOrchestrator(config, [] as never, new InMemorySignalMeshStore());
  const result = await orchestrator.executePlan({ ...plan, intents: plan.intents });
  return { runId: result.runId, executed: result.emitted };
};
