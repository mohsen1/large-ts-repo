import { asReadonlyTuple, makeTemporalWindow, normalizeScore, toRunPlanId, toSignalId, toTenantId, toPluginRunId } from '@shared/orchestration-lab-core';
import type { CommandId, IncidentId, LabMode, LabPlanInput, StageMap, StagePath, StageTuple } from './types';
import { toIncidentId } from './types';

export interface PlanTemplate {
  readonly tenant: string;
  readonly mode: LabMode;
  readonly incident: IncidentId;
  readonly title: string;
  readonly labels: readonly string[];
}

export interface PlanSeed {
  readonly tenant: string;
  readonly mode: LabMode;
  readonly labels: readonly string[];
}

const defaults = {
  chaos: {
    channel: 'agent',
    title: 'Chaos baseline sweep',
    incident: 'incident-chaos',
  },
  synthesis: {
    channel: 'scheduler',
    title: 'Synthesis scenario replay',
    incident: 'incident-synthesis',
  },
  continuity: {
    channel: 'manual',
    title: 'Continuity readiness drill',
    incident: 'incident-continuity',
  },
} as const;

export const createCommandId = (tenant: string, _mode: LabMode, sequence: number): CommandId =>
  toPluginRunId(`${tenant}:command:${String(sequence).padStart(8, '0')}`);

export const buildWindowByMode = (mode: LabMode): { from: string; to: string; timezone: string } => {
  const minutes = mode === 'chaos' ? 30 : mode === 'synthesis' ? 45 : 90;
  return makeTemporalWindow(new Date(), minutes);
};

export const planTemplates = (tenant: string): readonly PlanTemplate[] => [
  {
    tenant,
    mode: 'chaos',
    incident: toIncidentId(defaults.chaos.incident),
    title: defaults.chaos.title,
    labels: ['default', 'chaos', tenant],
  },
  {
    tenant,
    mode: 'synthesis',
    incident: toIncidentId(defaults.synthesis.incident),
    title: defaults.synthesis.title,
    labels: ['default', 'synthesis', tenant],
  },
  {
    tenant,
    mode: 'continuity',
    incident: toIncidentId(defaults.continuity.incident),
    title: defaults.continuity.title,
    labels: ['default', 'continuity', tenant],
  },
];

export const planSeed = <TMode extends LabMode>(mode: TMode): PlanSeed => ({
  tenant: 'tenant-default',
  mode,
  labels: ['seed', mode],
});

export const buildPlanInput = <TTemplate extends PlanTemplate>(template: TTemplate): LabPlanInput => {
  const window = buildWindowByMode(template.mode);
  const id = template.labels.join('-');
  return {
    runId: toRunPlanId(`${template.tenant}:${template.mode}:${Date.now()}`),
    commandId: createCommandId(template.tenant, template.mode, id.length),
    tenant: toTenantId(template.tenant),
    title: `${template.title} · ${template.labels[0] ?? 'seed'}`,
    window,
    mode: template.mode,
    signals: asReadonlyTuple(
      template.labels.map((label, index) => ({
        id: toSignalId(`${template.tenant}:${template.mode}:${label}`),
        incident: template.incident,
        tenant: toTenantId(template.tenant),
        category: `telemetry:${template.mode}:${label}`,
        severity: index === 0 ? 'critical' : index === 1 ? 'high' : 'moderate',
        channel: defaults[template.mode].channel,
        source: `seed-source:${template.tenant}`,
        value: normalizeScore(0.25 + index * 0.2),
        tags: [template.mode, label, defaults[template.mode].channel],
        metadata: {
          template: template.title,
          index,
          mode: template.mode,
        },
      })),
    ),
    metadata: {
      mode: template.mode,
      tenant: template.tenant,
      incident: template.incident,
    },
  };
};

export const stageMap = (): StageMap<readonly ['chaos', 'synthesis', 'continuity']> => ({
  chaos: ['stage:discovery', 'stage:validation', 'stage:execution', 'stage:rollback'],
  synthesis: ['stage:discovery', 'stage:validation', 'stage:execution', 'stage:rollback'],
  continuity: ['stage:discovery', 'stage:validation', 'stage:execution', 'stage:rollback'],
});

export const stagedPaths = <TModes extends readonly LabMode[]>(modes: TModes): readonly StagePath[] =>
  modes.flatMap((mode) =>
    ['discovery', 'validation', 'execution', 'rollback'].map((phase) => `stage:${mode}:${phase}` as StagePath),
  );

export const stageSeed = (): StageTuple => ['discovery', 'validation', 'execution', 'rollback'];

export const sequenceFromTemplate = (_template: Pick<PlanTemplate, 'labels' | 'mode'>): StageTuple =>
  ['discovery', 'validation', 'execution', 'rollback'];
