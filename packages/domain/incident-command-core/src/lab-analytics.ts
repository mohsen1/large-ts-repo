import type { CommandTemplate, CommandTemplateOptions, CommandRunbook } from './types';
import { rankCommandsForLab } from './lab-ops';
import {
  buildCommandSignals,
  buildPlanReadiness,
  mapSimulationFrame,
  rankByReadiness,
  buildPlanLabProfile,
  type LabCandidateSignal,
} from './lab-types';
import { describeCandidateSignals, estimateReadiness } from './lab-types';
import type { CommandTemplateId } from './types';
import type { PlanLabProfile, LabDiagnostics, PlanReadiness } from './lab-types';

export interface TemplateCoverage {
  readonly templateId: CommandTemplateId;
  readonly templateName: string;
  readonly coverage: number;
  readonly riskPenalty: number;
}

export interface ReadinessWindow {
  readonly label: string;
  readonly from: string;
  readonly to: string;
  readonly percentile: number;
}

export interface LabAnalyticsPack {
  readonly trend: readonly number[];
  readonly templateCoverage: readonly TemplateCoverage[];
  readonly candidateSignals: readonly LabCandidateSignal[];
  readonly recommendations: readonly string[];
}

export interface LabReadinessReport {
  readonly profile: PlanLabProfile;
  readonly readinessByTemplate: readonly {
    readonly templateId: CommandTemplateId;
    readonly profile: PlanReadiness;
  }[];
  readonly diagnostics: LabDiagnostics;
  readonly analytics: LabAnalyticsPack;
}

const buildTrend = (runs: readonly CommandRunbook[]): readonly number[] =>
  runs.map((runbook) => runbook.playbook.commands.length);

export const collectTemplateCoverage = (templates: readonly CommandTemplate[]): readonly TemplateCoverage[] =>
  templates.map((template) => ({
    templateId: template.id,
    templateName: template.name,
    coverage: Number((template.commandHints.length + template.safetyWindowMinutes / 10).toFixed(2)),
    riskPenalty: template.priorityModifier + template.commandHints.length * 0.2,
  }));

export const buildDiagnostics = (
  profile: PlanLabProfile,
  runbooks: readonly CommandRunbook[],
  options: CommandTemplateOptions,
): LabReadinessReport => {
  const allCommands = runbooks.flatMap((runbook) => runbook.playbook.commands);
  const ranked = rankByReadiness(allCommands.map((command) => command.expectedDurationMinutes / 10));
  const rankedCommands = runbooks.length > 0 ? rankCommandsForLab(runbooks[0]) : [] as const;
  const candidateSignals = buildCommandSignals(allCommands);
  const templateCoverage = collectTemplateCoverage(runbooks.map((runbook) => runbook.template));

  const rankedCandidates = ranked.map((entry) => ({
    value: allCommands[Math.max(0, entry.rank - 1)] ?? allCommands[0]!,
    score: entry.score,
    rank: entry.rank,
  }));

  const diagnostics: LabDiagnostics = {
    profile,
    topSignals: candidateSignals,
    rankedCandidates,
    traces: runbooks.flatMap((runbook, runbookIndex) => {
      const simulation = {
        runbook,
        frameOrder: runbook.playbook.commands.map((command) => command.id),
        parallelism: options.maxParallelism,
        expectedFinishAt: String(Date.now() + options.includeRollbackWindowMinutes * 60_000),
        violations: runbook.playbook.commands.map((command) => ({
          commandId: command.id,
          reason: command.label,
        })),
      };

      return runbook.playbook.commands.map((_, index) =>
        mapSimulationFrame(
          {
            ...simulation,
            runbook,
            frameOrder: simulation.frameOrder,
          },
          runbookIndex + index,
        ),
      );
    }),
    warnings: [
      ...candidateSignals.map((signal) => `signal:${signal.key}`),
      ...runbooks.flatMap((runbook, index) => [
        `runbook-${index}=${runbook.id}`,
        `state=${runbook.state}`,
      ]),
    ],
  };

  const readinessByTemplate = runbooks.flatMap((runbook) =>
    runbook.playbook.commands.map((command) => ({
      templateId: runbook.template.id,
      profile: buildPlanReadiness(command, [runbook.plan]),
    })),
  );

  const readyScore = Math.max(0, Math.min(100, estimateReadiness(runbooks, options.includeRollbackWindowMinutes)));
  const recommendations = [
    ...templateCoverage.map((entry) => `template:${entry.templateName}`),
    `parallelism=${options.maxParallelism}`,
    `risk=${options.maxRiskScore}`,
    `rollback=${options.includeRollbackWindowMinutes}`,
    `ready=${readyScore.toFixed(2)}`,
    ...describeCandidateSignals(candidateSignals),
    ...rankedCommands.slice(0, 3).map((candidate) => `candidate:${candidate.id}`),
  ];

  return {
    profile,
    readinessByTemplate,
    diagnostics,
    analytics: {
      trend: buildTrend(runbooks),
      templateCoverage,
      candidateSignals,
      recommendations,
    },
  };
};

export const evaluateRunbookEnvelope = (runbooks: readonly CommandRunbook[]): string =>
  runbooks
    .map((runbook) => String(runbook.id))
    .join('|');

export const buildWindowLabel = (profile: PlanLabProfile): ReadinessWindow => ({
  label: `${profile.tenantId}-${profile.commandCount}`,
  from: new Date().toISOString(),
  to: new Date(Date.now() + profile.windowMinutes * 60_000).toISOString(),
  percentile: Math.min(99, Math.max(1, profile.windowMinutes)),
});

export const summarizeCommandRisk = (runbooks: readonly CommandRunbook[]): number =>
  runbooks.reduce((sum, runbook) => sum + runbook.riskScore, 0);

export const formatCandidateSignals = (signals: readonly LabCandidateSignal[]): readonly string[] => describeCandidateSignals(signals);
