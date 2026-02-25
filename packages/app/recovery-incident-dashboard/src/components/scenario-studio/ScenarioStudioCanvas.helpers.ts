import { type ScenarioStageSpec } from '../../types/scenario-studio';

export interface StageMatrixRow {
  id: string;
  status: string;
  weight: number;
}

export function buildStageMatrix(stages: Array<{ id: string; status: string; weight: number }>): StageMatrixRow[] {
  const rows = [...stages];
  return rows.map((entry) => ({
    id: entry.id,
    status: entry.status,
    weight: Math.min(1, Math.max(0, Number(entry.weight))),
  }));
}

export function normalizeWeights(stages: readonly ScenarioStageSpec[]) {
  const count = stages.length || 1;
  return stages
    .map((stage) => ({
      id: stage.id,
      score: stage.confidence / count,
    }))
    .sort((a, b) => b.score - a.score);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const seconds = Math.floor(total / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}
