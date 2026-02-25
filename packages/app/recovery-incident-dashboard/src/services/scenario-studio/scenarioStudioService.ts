import { z } from 'zod';
import {
  StageTopology,
  buildTopologyFromStages,
  createRunId,
  createScenarioId,
  createStageId,
  deriveMetrics,
  type StageKind,
  type StageStatus,
  type StageTemplate,
  type StageVertex,
} from '@domain/recovery-scenario-design';
import type { ScenarioRunId } from '@domain/recovery-scenario-design';
import type {
  ScenarioDesignEvent,
  ScenarioDesignInput,
  ScenarioDesignOutput,
} from '@service/recovery-scenario-design-orchestrator';
import type {
  ScenarioStudioInput,
  ScenarioStudioServiceResponse,
  ScenarioRunSnapshot,
  ScenarioTemplate,
  ScenarioStageSpec,
  ScenarioWorkspaceState,
  ScenarioStudioModel,
  ScenarioNodeId,
} from '../../types/scenario-studio';

type SnapshotRunState = ScenarioRunSnapshot['state'];

const runState = z.enum(['building', 'deploying', 'running', 'monitoring', 'finished'] as const);
const runStageStatus = z.enum(['queued', 'warming', 'active', 'paused', 'completed', 'failed'] as const);

const templateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(3),
  description: z.string(),
  stages: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      status: z.string(),
      summary: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  createdAt: z.string(),
  owner: z.string(),
});

const runSnapshotSchema = z.object({
  runId: z.string(),
  templateId: z.string(),
  state: runState,
  mode: z.string(),
  startedAt: z.string(),
  progress: z.number().min(0).max(100),
  stagesComplete: z.number().min(0),
  durationMs: z.number().min(0),
  stageStats: z.array(
    z.object({
      stageId: z.string(),
      latencyMs: z.number(),
      status: runStageStatus,
    }),
  ),
});

const node = (value: string): ScenarioNodeId => value as ScenarioNodeId;

const mockTemplates: ScenarioTemplate[] = [
  {
    id: 'template-failover-playbook',
    name: 'Failover Playbook',
    description: 'Simulates region failover with staged mitigation and rollback hooks.',
    stages: [
      { id: node('s1'), name: 'Ingress', kind: 'ingress', status: 'queued', summary: 'Validates connectivity and source manifests.', confidence: 0.93 },
      { id: node('s2'), name: 'Enrichment', kind: 'enrichment', status: 'queued', summary: 'Enriches signal payloads with dependency graph context.', confidence: 0.91 },
      { id: node('s3'), name: 'Mitigation', kind: 'mitigation', status: 'queued', summary: 'Triggers adaptive orchestration and command dispatch.', confidence: 0.89 },
      { id: node('s4'), name: 'Verification', kind: 'verification', status: 'queued', summary: 'Verifies recovery blast radius and latency budgets.', confidence: 0.87 },
    ],
    createdAt: new Date().toISOString(),
    owner: 'infra-lab',
  },
  {
    id: 'template-database-chaos',
    name: 'Database Chaos Sweep',
    description: 'Injects synthetic packet-loss and replica lag with rollback.',
    stages: [
      { id: node('q1'), name: 'Forecast', kind: 'forecast', status: 'queued', summary: 'Pre-computes expected error windows.', confidence: 0.82 },
      { id: node('q2'), name: 'Mitigation', kind: 'mitigation', status: 'queued', summary: 'Executes chaos script and monitors health.', confidence: 0.94 },
      { id: node('q3'), name: 'Rollback', kind: 'rollback', status: 'queued', summary: 'Resets synthetic faults and validates service integrity.', confidence: 0.99 },
    ],
    createdAt: new Date().toISOString(),
    owner: 'chaos-team',
  },
];

function collectTopology(stages: readonly ScenarioStageSpec[]) {
  const vertices = stages.map((stage, index) => ({
    id: createStageId(stage.id as unknown as string, index),
    kind: stage.kind as StageKind,
    dependsOn: index === 0 ? [] : [createStageId(stage.id as unknown as string, index - 1)],
    config: {
      template: stage.name,
      confidence: stage.confidence,
    },
    execute: async () => ({ stage }),
  }));
  return buildTopologyFromStages(vertices);
}

function collectTopologySnapshot(stages: readonly ScenarioStageSpec[]) {
  const topology = new StageTopology<string, Record<string, unknown>>();
  const vertices: StageVertex<string, Record<string, unknown>>[] = stages.map((stage, index) => ({
    id: createStageId(stage.id as unknown as string, index),
    kind: stage.kind as StageKind,
    dependsOn: index === 0 ? [] : [createStageId(stage.id as unknown as string, index - 1)],
    config: {
      template: stage.name,
      confidence: stage.confidence,
    },
    execute: async () => ({ stage }),
  }));
  return buildTopologyFromStages(vertices).summarize();
}

function estimateMetricValue(metric: ReturnType<typeof deriveMetrics>[number]): number {
  const [entry] = Object.values(metric) as Array<{ value: number }>;
  return entry?.value ?? 0;
}

function buildRunSnapshot(input: ScenarioStudioInput): ScenarioRunSnapshot {
  const template = mockTemplates.find((item) => item.id === input.templateId);
  const stageSpecs = template?.stages ?? [];
  const metrics = deriveMetrics('latency', 'risk', 'cost');
  const topology = collectTopologySnapshot(stageSpecs);

  return {
    runId: createRunId(input.owner, BigInt(Date.now())),
    templateId: input.templateId,
    state: 'running',
    mode: input.mode,
    startedAt: new Date().toISOString(),
    progress: topology.topologyId ? 42 : 0,
    stagesComplete: stageSpecs.length,
    durationMs: 0,
    stageStats: stageSpecs.map((stage, index) => ({
      stageId: stage.id,
      latencyMs: estimateMetricValue(metrics[index] ?? ({ value: 0 } as { value: number })),
      status: stage.status,
    })),
  };
}

export const initialWorkspaceState: ScenarioWorkspaceState = {
  model: {
    templates: mockTemplates,
    selectedTemplateId: null,
    selectedRunId: null,
    currentMode: 'analysis',
  },
  history: [],
  runningRuns: [],
};

export function parseTemplates(raw: unknown): ScenarioTemplate[] {
  const payload = templateSchema.array().safeParse(raw);
  if (!payload.success) {
    return [];
  }
  return payload.data.map((template) => ({
    ...template,
    stages: template.stages.map((stage) => ({
      ...stage,
      id: node(stage.id),
      kind: stage.kind as StageKind,
      status: stage.status as ScenarioTemplate['stages'][number]['status'],
    })),
  }));
}

export async function fetchScenarioTemplates(): Promise<ScenarioTemplate[]> {
  await Promise.resolve();
  return mockTemplates;
}

export async function loadScenarioTemplateById(templateId: string): Promise<ScenarioTemplate | undefined> {
  const list = await fetchScenarioTemplates();
  return list.find((candidate) => candidate.id === templateId);
}

export async function startScenarioRun(input: ScenarioStudioInput): Promise<ScenarioStudioServiceResponse> {
  const template = await loadScenarioTemplateById(input.templateId);
  if (!template) {
    return {
      ok: false,
      error: `template not found: ${input.templateId}`,
    };
  }

  const runId = createRunId(input.owner, BigInt(Date.now()));
  const scenarioId = createScenarioId('studio', 42);

  const eventStream: ScenarioDesignEvent[] = [];
  const emit = (entry: ScenarioDesignEvent): void => {
    eventStream.push(entry);
  };

  const designInput: ScenarioDesignInput<{ owner: string; mode: string; parameters: Record<string, unknown> }> = {
    scenarioId,
    runId: runId as ScenarioRunId,
    initiatedBy: input.owner,
    correlationId: `corr-${runId}`,
    context: {
      owner: input.owner,
      mode: input.mode,
      parameters: input.parameters,
    },
  };

  const event: ScenarioDesignOutput = {
    runId: runId as ScenarioRunId,
    startedAt: Date.now(),
    status: 'running',
  };

  emit({
    type: 'scenario.started',
    scenarioId,
    runId: runId as ScenarioRunId,
    timestamp: event.startedAt,
    payload: designInput,
  });

  emit({
    type: 'scenario.completed',
    scenarioId,
    runId: runId as ScenarioRunId,
    timestamp: Date.now(),
    payload: designInput,
  });

  const snapshot = buildRunSnapshot(input);
  const safe = runSnapshotSchema.parse(snapshot);
  const typedState = safe.state as SnapshotRunState;
  const safeStages = safe.stageStats.map((entry) => ({
    ...entry,
    stageId: node(entry.stageId),
    status: entry.status as StageStatus,
  }));

  const signed = {
    ...snapshot,
    ...safe,
    runId: runId as ScenarioRunId,
    templateId: template.id,
    stageStats: safeStages,
    stagesComplete: template.stages.length,
    state: typedState,
    mode: input.mode,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    progress: template.stages.length > 0 ? 1 : 0,
  };

  return { ok: true, payload: signed };
}

export function parseTemplateInput(raw: unknown): ScenarioStudioModel {
  const parsed = parseTemplates(raw);
  return {
    templates: parsed,
    selectedTemplateId: parsed[0]?.id ?? null,
    selectedRunId: null,
    currentMode: 'analysis',
  };
}

export function normalizeMode(mode: string): ScenarioStudioInput['mode'] {
  return (['analysis', 'simulation', 'execution', 'chaos'] as const).includes(mode as ScenarioStudioInput['mode'])
    ? (mode as ScenarioStudioInput['mode'])
    : 'analysis';
}

export function validateTopology(signature: readonly StageTemplate<unknown, unknown, unknown>[]) {
  const vertices: StageVertex<string, Record<string, unknown>>[] = signature.map((entry, index) => ({
    id: createStageId(entry.id as unknown as string, index),
    kind: entry.kind as StageKind,
    dependsOn: [],
    config: {
      templateId: entry.id,
    },
    execute: async () => ({
      output: entry.inputShape,
    }),
  }));

  const topology = buildTopologyFromStages(vertices);
  const summary = topology.summarize();
  const metrics = deriveMetrics('latency', 'error', 'cost').map((metric) => Object.keys(metric).join(','));
  return {
    metricCount: metrics.length,
    topologyId: summary.topologyId,
    stageCount: summary.metrics,
  };
}

export function useScenarioStudioModel(rawTemplates?: unknown) {
  const parsed = parseTemplateInput(rawTemplates);
  const model: ScenarioStudioModel = {
    templates: parsed.templates,
    selectedTemplateId: parsed.templates[0]?.id ?? null,
    selectedRunId: null,
    currentMode: parsed.currentMode,
  };
  return {
    model,
    hasTemplates: model.templates.length > 0,
    templateCount: model.templates.length,
    ready: model.templates.length >= 1,
  };
}
