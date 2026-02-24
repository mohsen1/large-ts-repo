import { useMemo } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildScenarioTopology, ScenarioNode } from '@domain/recovery-cockpit-orchestration-core';
import { summarizeScenarioRuns } from '@domain/recovery-cockpit-orchestration-core';

type ScenarioTopologyPanelProps = {
  readonly plans: readonly RecoveryPlan[];
};

const regionStyle = (region: string): { readonly background: string; readonly color: string } => {
  const code = region.charCodeAt(0) % 3;
  if (code === 0) return { background: '#eef2ff', color: '#3730a3' };
  if (code === 1) return { background: '#ecfccb', color: '#365314' };
  return { background: '#fff7ed', color: '#9a3412' };
};

const nodeLabel = (node: ScenarioNode): string => {
  return `${node.phase.toUpperCase()} · ${node.serviceCode} · ${node.actionId}`;
};

const metricLine = (node: ScenarioNode): string => {
  return `${node.riskFactor.toFixed(2)} risk · ${node.durationMinutes}m`;
};

export const ScenarioTopologyPanel = ({ plans }: ScenarioTopologyPanelProps) => {
  const summaries = useMemo(() => summarizeScenarioRuns(plans), [plans]);
  const topologies = useMemo(() => plans.map((plan) => buildScenarioTopology(plan)), [plans]);

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h3>Scenario topology</h3>
      {topologies.map((topology) => {
        const state = summaries.find((item) => item.planId === topology.planId);
        return (
          <article key={topology.planId} style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h4 style={{ margin: 0 }}>{topology.planId}</h4>
              <span style={{ opacity: 0.85 }}>{state?.state ?? 'unknown'}</span>
            </div>
            <ul style={{ marginTop: 12, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {topology.nodes.map((node) => {
                const style = regionStyle(node.region);
                const line = metricLine(node);
                return (
                  <li
                    key={`${topology.planId}:${node.actionId}`}
                    style={{
                      borderLeft: `4px solid ${style.color}`,
                      background: style.background,
                      padding: '8px 10px',
                      borderRadius: 8,
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 600 }}>{nodeLabel(node)}</p>
                    <small>{line}</small>
                  </li>
                );
              })}
            </ul>
            <p style={{ marginBottom: 0, marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              ready windows={topology.readinessWindowMinutes.length} · critical={topology.bottlenecks.length}
            </p>
          </article>
        );
      })}
      {topologies.length === 0 ? <p>No scenarios loaded</p> : null}
    </section>
  );
};
