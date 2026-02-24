import type { IncidentLabScenario, IncidentLabPlan, IncidentLabRun, IncidentLabSignal } from '@domain/recovery-incident-lab-core';
import { summarizeRun } from './insights';
import { buildRunSummary } from './controller';
import { estimateWindowMinutes, validatePlan } from '@domain/recovery-incident-lab-core';
import type { PlanRiskScore } from '@domain/recovery-incident-lab-core';
import { computePlanRisk, summarizeSignalTrends } from '@domain/recovery-incident-lab-core';

export interface WorkItem {
  readonly title: string;
  readonly status: 'queued' | 'running' | 'done' | 'blocked';
  readonly detail: string;
}

export interface WorkbookLine {
  readonly section: string;
  readonly lines: readonly string[];
  readonly warnings: readonly string[];
}

export interface Workbook {
  readonly scenario: IncidentLabScenario;
  readonly plan: IncidentLabPlan;
  readonly run?: IncidentLabRun;
  readonly signals: readonly IncidentLabSignal[];
  readonly risk: PlanRiskScore;
  readonly lines: readonly WorkItem[];
}

export const makeWorkbook = (
  scenario: IncidentLabScenario,
  plan: IncidentLabPlan,
  run?: IncidentLabRun,
  signals: readonly IncidentLabSignal[] = [],
): Workbook => ({
  scenario,
  plan,
  run,
  signals,
  risk: computePlanRisk(scenario, signals, plan),
  lines: buildWorkItems(scenario, plan, run, signals),
});

const buildWorkItems = (
  scenario: IncidentLabScenario,
  plan: IncidentLabPlan,
  run: IncidentLabRun | undefined,
  signals: readonly IncidentLabSignal[],
): readonly WorkItem[] => {
  const validation = validatePlan(plan);
  const signalSummary = summarizeSignalTrends(signals);
  const planRisk = computePlanRisk(scenario, signals, plan);

  const header: WorkItem = {
    title: 'plan-validation',
    status: validation.ok ? 'done' : 'blocked',
    detail: validation.ok ? `valid with ${validation.issues.length || 0}` : validation.issues.join(','),
  };

  const estimate: WorkItem = {
    title: 'estimated-window',
    status: 'queued',
    detail: `${estimateWindowMinutes(scenario)}m`,
  };

  const runItem: WorkItem = run
    ? {
        title: 'run',
        status: run.state === 'completed' ? 'done' : 'running',
        detail: buildRunSummary(run),
      }
    : { title: 'run', status: 'blocked', detail: 'pending' };

  const risk: WorkItem = {
    title: 'risk',
    status: planRisk.score > 70 ? 'blocked' : 'running',
    detail: `score=${planRisk.score} bands=${planRisk.bands.length}`,
  };

  const signalWork: WorkItem[] = signalSummary.map((summary) => ({
    title: `signal-${summary.kind}`,
    status: summary.average > 20 ? 'running' : 'queued',
    detail: `avg=${summary.average} peak=${summary.peak}`,
  }));

  return [header, estimate, runItem, risk, ...signalWork];
};

export const toWorkbookText = (workbook: Workbook): string => {
  const lines = workbook.lines.map((item) => `${item.title}:${item.status}:${item.detail}`);
  const insight = workbook.run ? summarizeRun(workbook.run) : { completed: 0, total: 0 };
  const summary = workbook.run ? buildRunSummary(workbook.run) : 'no-run';
  return [
    `scenario=${workbook.scenario.id}`,
    `plan=${workbook.plan.id}`,
    summary,
    ...lines,
    `insight=${insight.completed}/${insight.total}`,
  ].join('\n');
};

export const workbookSections = (workbook: Workbook): readonly WorkbookLine[] => [
  {
    section: 'identity',
    lines: [workbook.scenario.id, workbook.scenario.name, workbook.scenario.owner],
    warnings: [],
  },
  {
    section: 'plan',
    lines: [workbook.plan.id, `${workbook.plan.state}`, `steps=${workbook.plan.selected.length}`],
    warnings: workbook.risk.score > 80 ? ['high-risk'] : [],
  },
  {
    section: 'signals',
    lines: workbook.signals.map((signal) => `${signal.kind}:${signal.node}:${signal.value}`),
    warnings: workbook.risk.bands.filter((band) => band.value === 'red').map((band) => `${band.signal}:red`),
  },
];
