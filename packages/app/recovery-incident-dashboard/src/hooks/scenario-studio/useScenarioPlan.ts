import { useMemo } from 'react';
import type { ScenarioTemplate } from '../../types/scenario-studio';
import { buildEngineTemplate, enrichTemplateDiagnostics, type StageVerb, designDefaults } from '@shared/scenario-design-kernel';
import { buildEngineTemplate as buildScenarioEngineTemplate } from '../../services/scenario-studio/scenarioStudioEngine';

export interface PlanSummary {
  readonly templateId: string;
  readonly kindMix: readonly string[];
  readonly averageStageRatio: number;
}

function deriveKindMix(template: ScenarioTemplate): readonly string[] {
  return template.stages.reduce((acc, stage) => {
    const next = new Set([...acc, stage.kind]);
    return [...next];
  }, [] as string[]);
}

export function useScenarioPlan(templates: readonly ScenarioTemplate[]) {
  const [engineTemplate] = buildEngineTemplateTuple(templates);
  const summary = useMemo(() => {
    const matrix = templates.map((template) => ({
      templateId: template.id,
      kindMix: deriveKindMix(template),
      averageStageRatio: template.stages.length / designDefaults.stages.length,
    }));

    return {
      matrix,
      top: matrix.sort((left, right) => right.averageStageRatio - left.averageStageRatio).slice(0, 3),
    };
  }, [templates]);

  const diagnostics = useMemo(() => {
    const values = enrichTemplateDiagnostics(templates);
    return values;
  }, [templates]);

  return {
    plan: engineTemplate,
    summary: summary.matrix,
    top: summary.top,
    diagnostics,
  };
}

export function filterTemplatesByKind(
  templates: readonly ScenarioTemplate[],
  kind: StageVerb,
): readonly ScenarioTemplate[] {
  return templates.filter((template) => template.stages.some((stage) => stage.kind === kind));
}

function buildEngineTemplateTuple(templates: readonly ScenarioTemplate[]) {
  const plan = buildScenarioEngineTemplate(
    templates.map((template) => ({
      ...template,
      stages: [...template.stages],
    })),
    {
      templateId: 'plan-default',
      owner: 'scenario-studio',
      mode: 'analysis',
      parameters: { stageCount: templates.length, createdAt: Date.now(), version: 1 },
    },
  );

  const filtered = templates.filter((template) => template.stages.length > 0);
  const tuple: readonly [string, number, typeof plan] = [
    `plan-${Date.now()}`,
    filtered.length,
    plan,
  ];

  return [tuple] as const;
}
