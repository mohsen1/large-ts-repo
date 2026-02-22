import { withBrand } from '@shared/core';
import type { RunSession, RunPlanSnapshot } from './types';
import type { RecoveryProgram } from '@domain/recovery-orchestration';

export interface DependencyCell {
  readonly source: string;
  readonly target: string;
  readonly kind: 'before' | 'after';
}

export interface OrchestrationMatrix {
  readonly matrixId: string;
  readonly tenant: string;
  readonly planId: string;
  readonly rows: readonly string[];
  readonly cols: readonly string[];
  readonly cells: readonly DependencyCell[];
  readonly cycleRisk: number;
  readonly generatedAt: string;
}

export interface ProgramLane {
  readonly laneId: string;
  readonly name: string;
  readonly stepIds: readonly string[];
  readonly parallelizable: boolean;
}

export interface ProgramReadiness {
  readonly tenant: string;
  readonly planId: string;
  readonly lanes: readonly ProgramLane[];
  readonly matrix: OrchestrationMatrix;
  readonly completionScore: number;
}

const uniqueString = (value: string): string => withBrand(`lane-${value}`, 'TenantId');

const lanePriority = (deps: number, index: number): number => Math.max(0, deps - index);

const makeLane = (program: RecoveryProgram, index: number): ProgramLane => {
  const deps = program.steps[index]?.dependencies.length ?? 0;
  const score = lanePriority(deps, index);
  return {
    laneId: uniqueString(`${index}-${program.steps[index]?.id ?? 'missing'}`),
    name: program.steps[index]?.command ?? `Lane ${index + 1}`,
    stepIds: [program.steps[index]?.id ?? `missing-${index}`],
    parallelizable: score % 2 === 0,
  };
};

const buildMatrixCells = (program: RecoveryProgram): readonly DependencyCell[] => {
  const cells: DependencyCell[] = [];
  for (const step of program.steps) {
    for (const dependency of step.dependencies) {
      cells.push({
        source: dependency,
        target: step.id,
        kind: 'before',
      });
    }
  }
  return cells;
};

const detectCycle = (program: RecoveryProgram, cells: readonly DependencyCell[]): number => {
  const adjacency = new Map<string, readonly string[]>();
  for (const cell of cells) {
    adjacency.set(cell.source, [...(adjacency.get(cell.source) ?? []), cell.target]);
  }

  const state = new Map<string, 'new' | 'visiting' | 'done'>();
  let cycles = 0;

  const dfs = (node: string): boolean => {
    const current = state.get(node);
    if (current === 'visiting') {
      cycles += 1;
      return true;
    }
    if (current === 'done') return false;

    state.set(node, 'visiting');
    for (const target of adjacency.get(node) ?? []) {
      dfs(target);
    }
    state.set(node, 'done');
    return false;
  };

  for (const step of program.steps) {
    void dfs(step.id);
  }

  const dependencyDensity = cells.length / Math.max(1, program.steps.length);
  return Math.max(0, cycles + dependencyDensity);
};

export const buildOrchestrationMatrix = (session: RunSession, snapshot: RunPlanSnapshot): OrchestrationMatrix => {
  const program = snapshot.program;
  const matrixCells = buildMatrixCells(program);
  const cycleRisk = detectCycle(program, matrixCells);

  return {
    matrixId: `${session.runId}:matrix`,
    tenant: String(session.runId).split(':')[0] ?? 'global',
    planId: snapshot.id,
    rows: program.steps.map((step) => step.id),
    cols: program.steps.map((step) => step.command),
    cells: matrixCells,
    cycleRisk,
    generatedAt: new Date().toISOString(),
  };
};

export const buildReadinessLanes = (program: RecoveryProgram): readonly ProgramLane[] => {
  const lanes = program.steps.map((_, index) => makeLane(program, index));
  return lanes.filter((lane) => lane.stepIds[0] !== '');
};

export const buildReadinessProfile = (session: RunSession, snapshot: RunPlanSnapshot): ProgramReadiness => {
  const lanes = buildReadinessLanes(snapshot.program);
  const matrix = buildOrchestrationMatrix(session, snapshot);
  const completionScore = Math.max(0, Math.min(1, 1 - matrix.cycleRisk / Math.max(1, matrix.cols.length)));

  return {
    tenant: matrix.tenant,
    planId: snapshot.id,
    lanes,
    matrix,
    completionScore,
  };
};
