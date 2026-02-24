import type { PluginName, PluginTag } from '@shared/orchestration-lab-core';
import type { LabMode, LabPhase, StageDescriptor } from './types';

export interface TopologyEdge {
  readonly source: PluginName;
  readonly target: PluginName;
  readonly weight: number;
}

export interface TopologyVertex {
  readonly plugin: PluginName;
  readonly phase: LabPhase;
  readonly tags: readonly PluginTag<string>[];
}

export interface TopologyGraph {
  readonly mode: LabMode;
  readonly nodes: readonly TopologyVertex[];
  readonly edges: readonly TopologyEdge[];
  readonly phasePath: readonly StageDescriptor[];
}

type ModePhaseMap<TModes extends readonly LabMode[]> = {
  [TMode in TModes[number]]: readonly LabPhase[];
};

const phaseSequence = ['discovery', 'validation', 'execution', 'rollback'] as const satisfies readonly LabPhase[];

export const buildPhaseSequence = <TModes extends readonly LabMode[]>(modes: TModes): ModePhaseMap<TModes> => {
  const sequenceByMode = {} as Record<string, readonly LabPhase[]>;
  for (const mode of modes) {
    sequenceByMode[mode] = phaseSequence;
  }
  return sequenceByMode as ModePhaseMap<TModes>;
};

export const topologyPhases = (): readonly StageDescriptor[] => [
  { mode: 'chaos', label: 'stage:discovery', description: 'Observe and classify candidate events.' },
  { mode: 'chaos', label: 'stage:validation', description: 'Validate candidate signals for execution.' },
  { mode: 'chaos', label: 'stage:execution', description: 'Run chaos commands against test targets.' },
  { mode: 'chaos', label: 'stage:rollback', description: 'Restore system stability and clear state.' },
];

export const buildTopology = (mode: LabMode): TopologyGraph => {
  const nodes: TopologyVertex[] = [
    {
      plugin: `plugin:${mode}-discover`,
      phase: 'discovery',
      tags: ['tag:discovery'],
    },
    {
      plugin: `plugin:${mode}-validate`,
      phase: 'validation',
      tags: ['tag:validation'],
    },
    {
      plugin: `plugin:${mode}-execute`,
      phase: 'execution',
      tags: ['tag:execution'],
    },
    {
      plugin: `plugin:${mode}-rollback`,
      phase: 'rollback',
      tags: ['tag:rollback'],
    },
  ];
  const edges: TopologyEdge[] = [
    { source: `plugin:${mode}-discover`, target: `plugin:${mode}-validate`, weight: 0.2 },
    { source: `plugin:${mode}-validate`, target: `plugin:${mode}-execute`, weight: 0.35 },
    { source: `plugin:${mode}-execute`, target: `plugin:${mode}-rollback`, weight: 0.45 },
  ];

  return { mode, nodes, edges, phasePath: topologyPhases() };
};
