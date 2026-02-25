import { useMemo } from 'react';
import {
  type AutomationBlueprint,
  type AutomationBlueprintStep,
  buildNodesFromBlueprint,
  summarizeTopology,
} from '@domain/recovery-cockpit-orchestration-core';
import type { ReactElement } from 'react';

type TopologyProps = {
  readonly blueprint: AutomationBlueprint;
  readonly onSelectStep?: (step: AutomationBlueprintStep<any>) => void;
};

const summarizeEdge = (stage: string): string =>
  stage === 'discover' ? 'discover' : stage;

export const AutomationTopologyViewer = ({ blueprint, onSelectStep }: TopologyProps): ReactElement => {
  const nodes = useMemo(() => buildNodesFromBlueprint(blueprint), [blueprint]);
  const digest = useMemo(() => summarizeTopology(nodes), [nodes]);
  const stepByNode = useMemo(
    () =>
      new Map(
        nodes.map((node) => [node.nodeId, blueprint.steps.find((step) => `node:${step.stepId}` === node.nodeId)] as const),
      ),
    [blueprint.steps, nodes],
  );

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h3>Topology</h3>
      <p>{digest}</p>
      <ul>
        {nodes.map((node) => (
          <li
            key={node.nodeId}
            onClick={() => {
              const step = stepByNode.get(node.nodeId);
              if (!step) return;
              onSelectStep?.(step as AutomationBlueprintStep<any>);
            }}
            style={{
              border: '1px solid #223',
              padding: 8,
              borderRadius: 8,
              marginBottom: 8,
              cursor: onSelectStep ? 'pointer' : 'default',
            }}
          >
            <div>
              <strong>{node.pluginId}</strong>
            </div>
            <div>{summarizeEdge(node.stage)}</div>
            <small>{node.edges.length} links</small>
          </li>
        ))}
      </ul>
    </section>
  );
};
