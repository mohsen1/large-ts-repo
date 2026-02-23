import { type FabricPlanStep, type FabricPlan, type FabricRunId, type AlertSignal } from '@domain/recovery-ops-fabric';

export interface CommandEnvelope {
  readonly runId: FabricRunId;
  readonly stepId: string;
  readonly issuedAt: string;
  readonly targets: ReadonlyArray<{ nodeId: string; action: FabricPlanStep['action'] }>;
}

export interface CommandBatch {
  readonly batchId: string;
  readonly commands: readonly CommandEnvelope[];
  readonly count: number;
}

export const planToCommandBatch = (plan: FabricPlan, runId: FabricRunId): CommandBatch => {
  const commands = plan.steps.map((step) => ({
    runId,
    stepId: step.stepId,
    issuedAt: new Date().toISOString(),
    targets: [
      {
        nodeId: step.nodeId,
        action: step.action,
      },
    ],
  }));

  return {
    batchId: `batch-${runId}`,
    commands,
    count: commands.length,
  };
};

export const mergeSignals = (left: readonly AlertSignal[], right: readonly AlertSignal[]): AlertSignal[] => {
  const merged = [...left, ...right];
  const seen = new Set<string>();
  const out: AlertSignal[] = [];

  for (const signal of merged) {
    if (seen.has(signal.id)) {
      continue;
    }
    seen.add(signal.id);
    out.push(signal);
  }

  return out;
};

export const commandPayload = (command: CommandEnvelope): string => {
  return JSON.stringify(command);
};
