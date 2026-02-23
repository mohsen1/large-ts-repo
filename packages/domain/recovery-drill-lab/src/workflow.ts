import {
  type DrillChecklistItem,
  type DrillLabRunId,
  type DrillRunSnapshot,
  type DrillRunStep,
  type DrillScenario,
  type DrillWorkspace,
  createRunId,
  createScenarioId,
  createWorkspaceId,
  createChecklistItemId,
  type StepExecutionId,
  type DrillWorkspaceId,
  type DrillWorkspacePage,
  DrillRunWorkspaceResponse,
} from './types';

const nowIso = () => new Date().toISOString();

export const makeWorkspaceSeed = (
  seed: string,
  input: {
    tenant: string;
    environment: 'dev' | 'staging' | 'prod';
    ownerTeam: string;
  },
): DrillWorkspace => ({
  id: createWorkspaceId(seed),
  scenarioIds: [],
  name: `${input.tenant}-lab`,
  description: `workspace for ${input.tenant}`,
  metadata: {
    tenant: input.tenant,
    environment: input.environment,
    ownerTeam: input.ownerTeam,
    createdBy: input.tenant,
    tags: ['synthetic', 'drill-lab'],
  },
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

export const makeScenarioSeed = (seed: string, workspaceId: DrillWorkspaceId): DrillScenario => {
  const items: readonly DrillChecklistItem[] = [
    {
      id: createChecklistItemId(`${seed}-step-1`),
      step: 'containment-check',
      family: 'containment',
      prerequisites: [],
      slaMinutes: 5,
      estimatedMinutes: 7,
      runbookRef: 'runbook://containment',
    },
    {
      id: createChecklistItemId(`${seed}-step-2`),
      step: 'restore',
      family: 'restore',
      prerequisites: [createChecklistItemId(`${seed}-step-1`)],
      slaMinutes: 12,
      estimatedMinutes: 15,
      runbookRef: 'runbook://restore',
    },
  ];

  return {
    id: createScenarioId(seed),
    workspaceId,
    title: `Scenario ${seed}`,
    summary: 'Synthetic recovery drill',
    blastRadius: 'regional',
    steps: items,
    tags: ['auto', 'sre'],
    objectives: ['stability', 'communication'],
  };
};

export const makeRunSeed = (workspace: DrillWorkspace, scenario: DrillScenario): DrillRunSnapshot => {
  const timestamp = nowIso();
  const runId = createRunId(`${workspace.id}-${scenario.id}-${timestamp}`);

  const steps = scenario.steps.map((step, index) => ({
    id: `${step.id}-${index}` as unknown as StepExecutionId,
    runId,
    order: index + 1,
    family: step.family,
    name: step.step,
    owner: workspace.metadata.ownerTeam,
    status: index === 0 ? 'active' : 'pending',
    startedAt: index === 0 ? timestamp : undefined,
    finishedAt: undefined,
    evidence: [],
    checkpoints: [
      {
        timestamp,
        metric: 'health',
        value: 100,
        unit: 'score',
        tags: { owner: workspace.metadata.ownerTeam },
      },
    ],
    metadata: {
      scenarioStepId: step.id,
    },
  } as DrillRunStep));

  return {
    id: runId,
    workspaceId: workspace.id,
    scenarioId: scenario.id,
    scenarioName: scenario.title,
    status: 'queued',
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: undefined,
    priority: 'high',
    riskBudgetPercent: 0.17,
    steps,
    signals: [
      {
        name: 'baseline',
        source: 'slo',
        confidence: 0.97,
        severity: 'medium',
        detectedAt: timestamp,
        metric: {
          timestamp,
          metric: 'recovery-gap',
          value: 0,
          unit: 'ratio',
        },
      },
    ],
    metadata: {
      source: 'seed',
      workspace: workspace.name,
    },
  };
};

export const mapWorkspacePage = (workspace: DrillWorkspace, count: number): DrillWorkspacePage => ({
  page: {
    items: [workspace],
    hasMore: count > 1,
    nextCursor: count > 1 ? workspace.id : undefined,
  },
});

export const buildWorkspaceResponse = (
  runs: readonly DrillRunSnapshot[],
  hasMore = false,
): DrillRunWorkspaceResponse => ({
  runs,
  hasMore,
  nextCursor: runs.length ? runs[runs.length - 1]?.id : undefined,
});
