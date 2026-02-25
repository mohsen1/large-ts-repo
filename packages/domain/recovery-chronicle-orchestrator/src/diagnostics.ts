import type {
  OrchestratedStepResult,
  OrchestrationDiagnostic,
  OrchestrationRunId,
  OrchestrationStage,
} from './types';

export interface DiagnosticSummary {
  critical: number;
  warning: number;
  ok: number;
  error: number;
  maxScore: number;
}

const scoreLabel = (score: number): OrchestrationDiagnostic['key'] =>
  score >= 90 ? 'diag.critical' : score >= 70 ? 'diag.warning' : score >= 50 ? 'diag.error' : 'diag.ok';

export const buildDiagnostics = (runId: OrchestrationRunId, outputs: readonly OrchestratedStepResult[]): readonly OrchestrationDiagnostic[] =>
  outputs.map((output, index) => ({
    runId,
    key: scoreLabel(output.score),
    score: output.score,
    message: `${index}:${output.stage}:${output.status}:${output.latencyMs}`,
  }));

export const summarizeDiagnostics = (diagnostics: readonly OrchestrationDiagnostic[]): DiagnosticSummary =>
  diagnostics.reduce<DiagnosticSummary>(
    (acc, entry) => {
      if (entry.key === 'diag.critical') acc.critical += 1;
      if (entry.key === 'diag.warning') acc.warning += 1;
      if (entry.key === 'diag.ok') acc.ok += 1;
      if (entry.key === 'diag.error') acc.error += 1;
      acc.maxScore = Math.max(acc.maxScore, entry.score);
      return acc;
    },
    { critical: 0, warning: 0, ok: 0, error: 0, maxScore: 0 },
  );

export const formatStageDiagnostics = (diagnostics: readonly OrchestrationDiagnostic[], stage: OrchestrationStage): string =>
  diagnostics.filter((entry) => entry.message.includes(stage)).map((entry) => `${entry.key}:${entry.message}`).join(', ');
