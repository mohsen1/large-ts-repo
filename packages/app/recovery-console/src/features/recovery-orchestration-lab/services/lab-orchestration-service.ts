import {
  buildPlanInput,
  createOrchestrator,
  type PlanTemplate,
  type LabMode,
  planTemplates,
  type OrchestrationResult,
} from '@domain/recovery-lab-stress-lab-core';
import { normalizeScore } from '@shared/orchestration-lab-core';
import { toIncidentId } from '@domain/recovery-lab-stress-lab-core';

export interface ChaosLabPlanResult {
  readonly title: string;
  readonly summary: string;
  readonly directiveCount: number;
  readonly artifactCount: number;
  readonly timeline: readonly string[];
  readonly confidence: number;
}

export interface LabDashboardTemplate {
  readonly tenant: string;
  readonly mode: LabMode;
}

const templateFor = (tenant: string, mode: LabMode): PlanTemplate => {
  const candidate = planTemplates(tenant).find((entry) => entry.mode === mode);
  return (
    candidate ?? {
      tenant,
      mode,
      incident: toIncidentId(`${tenant}-incident`),
      title: `${tenant} · ${mode}`,
      labels: ['fallback', mode],
    }
  );
};

export const buildLabTemplate = ({ tenant, mode }: LabDashboardTemplate): PlanTemplate =>
  templateFor(tenant, mode);

export const runChaosLabPlan = async (tenant: string, mode: LabMode): Promise<ChaosLabPlanResult> => {
  const plan = buildPlanInput(buildLabTemplate({ tenant, mode }));
  const orchestrator = createOrchestrator(tenant, mode);
  const result: OrchestrationResult = await orchestrator.execute(plan);

  const confidence = normalizeScore(result.snapshot.directiveCount / Math.max(1, result.snapshot.artifactCount || 1));
  return {
    title: result.title,
    summary: result.summary,
    directiveCount: result.snapshot.directiveCount,
    artifactCount: result.snapshot.artifactCount,
    timeline: result.timeline.map((step) => `${step.plugin}::${step.latencyMs}`),
    confidence,
  };
};
