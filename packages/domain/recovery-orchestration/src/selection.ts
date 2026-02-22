import type { RecoveryMode, RecoveryPriority, RecoveryProgram, RecoveryProgramProjection, RecoveryRunState } from './types';

export interface ProgramSelectorFilters {
  readonly tenant?: string;
  readonly priorities?: readonly RecoveryPriority[];
  readonly mode?: RecoveryMode;
  readonly minSteps?: number;
}

export interface ProgramSlice {
  readonly programId: RecoveryProgram['id'];
  readonly projection: RecoveryProgramProjection;
  readonly score: number;
}

const modeScore: Record<RecoveryMode, number> = {
  preventive: 1,
  defensive: 2,
  restorative: 3,
  emergency: 4,
};

const priorityScore: Record<RecoveryPriority, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

export const filterPrograms = (
  programs: readonly RecoveryProgram[],
  filters: ProgramSelectorFilters,
): readonly RecoveryProgram[] =>
  programs.filter((program) => {
    if (filters.tenant && `${program.tenant}` !== filters.tenant) return false;
    if (filters.mode && program.mode !== filters.mode) return false;
    if (filters.priorities?.length && !filters.priorities.includes(program.priority)) return false;
    if (filters.minSteps !== undefined && program.steps.length < filters.minSteps) return false;
    return true;
  });

export const prioritizePrograms = (
  programs: readonly RecoveryProgram[],
  context: Pick<RecoveryRunState, 'status'>,
): readonly ProgramSlice[] =>
  programs
    .map((program) => {
      const projection: RecoveryProgramProjection = {
        id: program.id,
        name: program.name,
        priority: program.priority,
        mode: program.mode,
        serviceCount: program.topology.rootServices.length + program.topology.fallbackServices.length,
        stepCount: program.steps.length,
        hasBlockingConstraints: program.constraints.some((constraint) => constraint.threshold < 0.2),
      };
      const score =
        priorityScore[program.priority] * 1000 +
        modeScore[program.mode] * 250 +
        context.status.length * 20 +
        projection.stepCount;
      return { programId: program.id, projection, score };
    })
    .sort((a, b) => b.score - a.score);
