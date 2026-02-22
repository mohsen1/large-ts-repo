import type { SimulationRunRecord, SimulationCommand } from '@domain/recovery-simulation-core';

export interface SimulationAuditEvent {
  readonly runId: string;
  readonly command: SimulationCommand['command'];
  readonly state: SimulationRunRecord['state'];
  readonly timestamp: string;
}

export const toAuditEvent = (run: SimulationRunRecord, command: SimulationCommand): SimulationAuditEvent => ({
  runId: run.id,
  command: command.command,
  state: run.state,
  timestamp: new Date().toISOString(),
});

export const toSummaryLine = (run: SimulationRunRecord): string =>
  `${run.id}:steps=${run.executedSteps.length}:state=${run.state}:risk=${run.residualRiskScore.toFixed(2)}`;
