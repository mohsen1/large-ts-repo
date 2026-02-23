import { Brand } from '@shared/type-level';
import type { CommandPlan, CommandExecutionSnapshot, CommandId, CommandPlanStep, CommandDefinition } from './types';

export type SignalProfileId = Brand<string, 'SignalProfileId'>;
export type SignalSeriesId = Brand<string, 'SignalSeriesId'>;

export interface CommandSignalPoint {
  readonly at: string;
  readonly commandId: CommandId;
  readonly signal: 'cpu' | 'memory' | 'latency' | 'error-rate';
  readonly value: number;
  readonly unit: string;
}

export interface CommandSignalSeries {
  readonly id: SignalSeriesId;
  readonly tenantId: string;
  readonly commandId: CommandId;
  readonly points: readonly CommandSignalPoint[];
}

export interface CommandLabSignalProfile {
  readonly id: SignalProfileId;
  readonly tenantId: string;
  readonly createdAt: string;
  readonly commandId: CommandId;
  readonly executionId: string;
  readonly series: readonly CommandSignalSeries[];
  readonly severity: 'low' | 'medium' | 'high';
}

export interface CommandPlanSignalSnapshot {
  readonly planId: CommandPlan['id'];
  readonly tenantId: string;
  readonly sampledAt: string;
  readonly steps: readonly {
    step: CommandPlanStep['commandTitle'];
    signalCount: number;
    avgValue: number;
  }[];
}

const normalizeSignalValue = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
};

export const createSignalPoint = (tenantId: string, commandId: string, signal: CommandSignalPoint['signal'], value: number): CommandSignalPoint => ({
  at: new Date().toISOString(),
  commandId: commandId as CommandId,
  signal,
  value: normalizeSignalValue(value),
  unit: signal === 'latency' ? 'ms' : 'ratio',
});

export const createSignalProfile = (
  tenantId: string,
  commandId: string,
  execution: CommandExecutionSnapshot,
): CommandLabSignalProfile => {
  const command = execution.startedWith.title;
  const seed = `${tenantId}:${commandId}:${execution.executionId}`;
  const cpuSeries: CommandSignalSeries = {
    id: `${seed}:cpu` as SignalSeriesId,
    tenantId,
    commandId: execution.commandId,
    points: [
      createSignalPoint(tenantId, execution.commandId, 'cpu', 0.11),
      createSignalPoint(tenantId, execution.commandId, 'cpu', 0.18),
      createSignalPoint(tenantId, execution.commandId, 'cpu', 0.12),
    ],
  };
  const latencySeries: CommandSignalSeries = {
    id: `${seed}:latency` as SignalSeriesId,
    tenantId,
    commandId: execution.commandId,
    points: [
      createSignalPoint(tenantId, execution.commandId, 'latency', 120),
      createSignalPoint(tenantId, execution.commandId, 'latency', 90),
      createSignalPoint(tenantId, execution.commandId, 'latency', 130),
    ],
  };
  const errorSeries: CommandSignalSeries = {
    id: `${seed}:errors` as SignalSeriesId,
    tenantId,
    commandId: execution.commandId,
    points: [
      createSignalPoint(tenantId, execution.commandId, 'error-rate', 0.005),
      createSignalPoint(tenantId, execution.commandId, 'error-rate', 0.001),
      createSignalPoint(tenantId, execution.commandId, 'error-rate', 0.002),
    ],
  };

  const severity = execution.status === 'completed' ? 'low' : 'medium';
  return {
    id: `${seed}:profile` as SignalProfileId,
    tenantId,
    createdAt: new Date().toISOString(),
    commandId: execution.commandId,
    executionId: execution.executionId,
    series: [cpuSeries, latencySeries, errorSeries],
    severity,
  };
};

export const summarizeSnapshotSignals = (
  plan: CommandPlan,
  commands: readonly CommandDefinition[],
): CommandPlanSignalSnapshot => {
  const commandIds = new Set<string>(plan.steps.map((step) => step.commandId));
  const matching = commands.filter((command) => commandIds.has(command.id));
  const steps = matching
    .map((command) => {
      const points = [
        createSignalPoint(plan.tenantId, command.id, 'cpu', command.riskWeight * 100),
        createSignalPoint(plan.tenantId, command.id, 'memory', command.riskWeight * 80),
        createSignalPoint(plan.tenantId, command.id, 'latency', command.window.maxConcurrent * 10),
      ];
      const avgValue = points.reduce((sum, point) => sum + point.value, 0) / points.length;
      return {
        step: command.title,
        signalCount: points.length,
        avgValue: Number(avgValue.toFixed(2)),
      };
    })
    .sort((left, right) => right.avgValue - left.avgValue);

  return {
    planId: plan.id,
    tenantId: plan.tenantId,
    sampledAt: new Date().toISOString(),
    steps,
  };
};

export const mergeSeries = (
  base: readonly CommandSignalSeries[],
  next: readonly CommandSignalSeries[],
): readonly CommandSignalSeries[] => {
  const map = new Map<string, CommandSignalSeries>();
  for (const series of base) {
    map.set(series.id, series);
  }
  for (const series of next) {
    map.set(series.id, series);
  }
  return [...map.values()].map((entry) => ({
    ...entry,
    points: [...entry.points].sort((left, right) => left.at.localeCompare(right.at)),
  }));
};

export const latestSignalSeverity = (profiles: readonly CommandLabSignalProfile[]): 'low' | 'medium' | 'high' => {
  if (profiles.some((profile) => profile.severity === 'high')) {
    return 'high';
  }
  if (profiles.some((profile) => profile.severity === 'medium')) {
    return 'medium';
  }
  return 'low';
};
