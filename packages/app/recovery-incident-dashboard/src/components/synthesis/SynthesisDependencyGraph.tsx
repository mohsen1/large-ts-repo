import { memo, useMemo } from 'react';
import type { ScenarioBlueprint } from '@domain/recovery-scenario-lens';
import { ScenarioDependencyGraph } from '@domain/recovery-scenario-lens';

interface SynthesisDependencyGraphProps {
  readonly blueprint: ScenarioBlueprint;
}

export const SynthesisDependencyGraph = memo(({ blueprint }: SynthesisDependencyGraphProps) => {
  const graph = useMemo(
    () => new ScenarioDependencyGraph(blueprint.commands, blueprint.links, blueprint.scenarioId),
    [blueprint.commands, blueprint.links],
  );
  const nodes = graph.nodes;
  const edges = graph.edges;
  const layers = graph.bucketByLayer();

  return (
    <section className="synthesis-graph">
      <h3>Dependency topology</h3>
      <p>nodes={nodes.length} • edges={edges.length}</p>
      <div className="graph-body">
        {layers.map((layer, layerIndex) => (
          <article key={`layer-${layerIndex}`} className="graph-layer">
            <h4>Layer {layerIndex + 1}</h4>
            <ul>
              {layer.map((nodeId) => {
                const node = nodes.find((candidate) => candidate.id === nodeId);
                return (
                  <li key={String(nodeId)} title={node?.command.targetService ?? ''}>
                    {String(node?.command.commandName)} ({String(nodeId)})
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
      <article>
        <h4>Critical path</h4>
        <ol>
          {graph.criticalPath().map((commandId) => {
            const node = nodes.find((candidate) => candidate.id === commandId);
            return <li key={String(commandId)}>{node?.command.commandName ?? String(commandId)}</li>;
          })}
        </ol>
      </article>
      {graph.hasCycle() ? <p>Cycle detected; execution may deadlock.</p> : null}
    </section>
  );
});
