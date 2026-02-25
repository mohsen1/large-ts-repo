import { useMemo } from 'react';
import type { ScenarioTemplate } from '../../types/scenario-studio';
import { runDiagnosticsFromTemplates } from '../../hooks/scenario-studio/useScenarioDiagnostics';
import { summarizeTemplates } from '../../components/scenario-studio/ScenarioStudioRunInspector';

interface ScenarioStudioTopologyPanelProps {
  readonly templates: readonly ScenarioTemplate[];
}

export interface TopologyNode {
  readonly templateId: string;
  readonly stageCount: number;
  readonly index: number;
}

function toNodes(templates: readonly ScenarioTemplate[]): readonly TopologyNode[] {
  return templates.flatMap((template, templateIndex) =>
    template.stages.map((_stage, stageIndex) => ({
      templateId: template.id,
      stageCount: template.stages.length,
      index: templateIndex * 100 + stageIndex,
    })),
  );
}

export function ScenarioStudioTopologyPanel({ templates }: ScenarioStudioTopologyPanelProps) {
  const nodes = useMemo(() => toNodes(templates), [templates]);
  const diagnostics = useMemo(() => runDiagnosticsFromTemplates(templates), [templates]);
  const summaries = useMemo(
    () =>
      summarizeTemplates(
        templates.map((template) => ({
          templateId: template.id,
          stages: template.stages,
        })),
      ),
    [templates],
  );
  const groups = useMemo(
    () => nodes.reduce((acc, node) => {
      const key = node.templateId;
      const existing = acc.get(key) ?? [];
      existing.push(node);
      acc.set(key, existing);
      return acc;
    }, new Map<string, TopologyNode[]>()),
    [nodes],
  );

  return (
    <section className="scenario-studio-topology">
      <h3>Topology</h3>
      <p>Computed nodes: {nodes.length}</p>
      <div>
        {nodes.slice(0, 12).map((node) => (
          <article key={`${node.templateId}-${node.index}`}>
            <span>{node.templateId}</span>
            <strong>{node.stageCount}</strong>
          </article>
        ))}
      </div>
      <div>
        <h4>Topology health</h4>
        {Array.from(summaries.stageBuckets.entries()).map(([templateId, count]) => (
          <p key={templateId}>{templateId}:{count}</p>
        ))}
        {diagnostics.slice(0, 6).map((metric) => (
          <p key={metric.templateId}>{metric.templateId}{' => '}{metric.averageStageCount}</p>
        ))}
      </div>
      <div>
        <h4>Templates</h4>
        {Array.from(groups.entries()).map(([templateId, values]) => (
          <article key={templateId}>
            <h5>{templateId}</h5>
            <p>nodes={values.length}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default ScenarioStudioTopologyPanel;
