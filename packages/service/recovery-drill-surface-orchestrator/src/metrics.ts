import type { SurfaceAnalysis } from './types';
import type { SurfaceCommandResult } from './types';

export interface CommandMetrics {
  readonly total: number;
  readonly averageRisk: number;
  readonly averageScore: number;
  readonly avgVelocity: number;
}

export interface SurfaceHistory {
  readonly commandIds: readonly string[];
  readonly analyses: readonly SurfaceAnalysis[];
}

const emptyMetrics: CommandMetrics = { total: 0, averageRisk: 0, averageScore: 0, avgVelocity: 0 };

export const analyzeBatch = (results: readonly SurfaceCommandResult[]): CommandMetrics => {
  if (results.length === 0) {
    return emptyMetrics;
  }

  const total = results.length;
  const sumRisk = results.reduce((acc, item) => acc + (item.analysis?.risk ?? 0), 0);
  const sumScore = results.reduce((acc, item) => acc + (item.analysis?.score ?? 0), 0);
  const sumVelocity = results.reduce((acc, item) => acc + (item.analysis?.velocity ?? 0), 0);

  return {
    total,
    averageRisk: Math.round(sumRisk / total),
    averageScore: Math.round(sumScore / total),
    avgVelocity: Math.round(sumVelocity / total),
  };
};

export const buildHistory = (items: readonly SurfaceCommandResult[]): SurfaceHistory => ({
  commandIds: items.map((item) => item.command.commandId),
  analyses: items.map((item) => item.analysis).filter((item): item is SurfaceAnalysis => Boolean(item)),
});
