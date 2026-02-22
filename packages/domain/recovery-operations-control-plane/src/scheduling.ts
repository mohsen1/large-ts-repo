import { withBrand } from '@shared/core';
import type { ControlPlaneCommand, ControlPlaneEnvelopeId, ControlPlaneRunId, PlanSchedule, ScheduleWindow } from './types';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import { buildExecutionLayers } from './topology';

export interface ScheduleInput {
  readonly runId: ControlPlaneRunId;
  readonly program: RecoveryProgram;
  readonly timezone: string;
  readonly minimumCadenceMinutes: number;
  readonly maxConcurrent: number;
}

export interface ScheduleConflict {
  readonly commandId: ControlPlaneCommand['id'];
  readonly reason: string;
}

export interface ScheduleOutput {
  readonly runId: ControlPlaneRunId;
  readonly scheduleId: ControlPlaneEnvelopeId;
  readonly windows: readonly ScheduleWindow[];
  readonly conflicts: readonly ScheduleConflict[];
  readonly maxConcurrent: number;
}

const toWindowLabel = (index: number, layerIndex: number): string =>
  `layer-${layerIndex}-slot-${index}`;

const cadenceMinutes = (input: Pick<ScheduleInput, 'minimumCadenceMinutes' | 'program'>): number => {
  const base = Math.max(1, input.minimumCadenceMinutes);
  const pressure = Math.max(1, Math.floor(input.program.steps.length / 8));
  return Math.max(1, base / pressure);
};

const clampConcurrency = (maxConcurrent: number): number => {
  if (!Number.isFinite(maxConcurrent)) return 1;
  return Math.min(12, Math.max(1, Math.floor(maxConcurrent)));
};

const buildSlotWindows = (runId: ControlPlaneRunId, windows: ReadonlyArray<ReadonlyArray<string>>): readonly ScheduleWindow[] => {
  const output: ScheduleWindow[] = [];
  windows.forEach((layer, layerIndex) => {
    for (const [slotIndex, stepId] of layer.entries()) {
      const base = new Date(Date.now() + (layerIndex + slotIndex) * 30_000).toISOString();
      output.push({
        label: `${toWindowLabel(slotIndex, layerIndex)}:${String(stepId)}`,
        startsAt: base,
        endsAt: new Date(Date.now() + ((layerIndex + slotIndex + 1) * 30_000)).toISOString(),
      });
    }
  });

  return output;
};

export const computeSchedule = (input: ScheduleInput): ScheduleOutput => {
  const { runId, program } = input;
  const plan = runId as string;
    const graphWindows = buildExecutionLayers({
    runId,
    nodes: program.steps.map((step) => step.id),
    edges: program.steps.flatMap((step) =>
      step.dependencies.map((dependency) => ({
        from: dependency,
        to: step.id,
        weight: 1,
      })),
    ),
    rootNodes: [],
    terminalNodes: [],
  });

  const cadence = cadenceMinutes(input);
    const windows = buildSlotWindows(runId, graphWindows);
  const conflicts: ScheduleConflict[] = [];

  const maxConcurrent = clampConcurrency(input.maxConcurrent || 1);
  const layerSizes = graphWindows.map((layer) => layer.length);
  const maxLayerSize = Math.max(0, ...layerSizes);
  if (maxLayerSize > maxConcurrent) {
    for (let index = 0; index < graphWindows.length; index += 1) {
      const layer = graphWindows[index];
      if (layer.length > maxConcurrent) {
        for (let offset = maxConcurrent; offset < layer.length; offset += 1) {
          const commandId = withBrand(`${plan}-${String(layer[offset])}`, 'ControlCommandId');
          conflicts.push({
            commandId,
            reason: `Layer ${index} exceeds max concurrency of ${maxConcurrent}`,
          });
        }
      }
    }
  }

    const adjustedWindows = windows.map((window, index) => {
    const start = new Date(window.startsAt).getTime() + index * cadence * 60_000;
    const end = start + Math.max(1, cadence) * 60_000;
    return {
      label: `${window.label}#${window.startsAt.slice(11, 16)}`,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
    };
  });

  return {
    runId,
    scheduleId: withBrand(`${runId}-${Date.now()}`, 'ControlPlaneEnvelopeId'),
    windows: adjustedWindows,
    conflicts,
    maxConcurrent,
  };
};

export const normalizeScheduleWindows = (schedule: PlanSchedule, timezone = 'UTC'): readonly ScheduleWindow[] => {
  return schedule.windows.map((window) => ({
    ...window,
    label: `${timezone}:${window.label}`,
  }));
};
