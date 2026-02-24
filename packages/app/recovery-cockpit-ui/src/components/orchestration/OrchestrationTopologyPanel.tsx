import { useMemo } from 'react';
import { useAdvancedOrchestrationDiagnostics } from '../../hooks/useAdvancedOrchestrationDiagnostics';
import { OrchestratorPhase } from '@shared/ops-orchestration-runtime';

interface OrchestrationTopologyPanelProps {
  readonly workspaceId: string;
  readonly plans: ReadonlyArray<{ planId: string }>;
}

const phaseColor = (phase: OrchestratorPhase): string => {
  switch (phase) {
    case 'intake':
      return '#2d7ff9';
    case 'validate':
      return '#2ea44f';
    case 'plan':
      return '#f97316';
    case 'execute':
      return '#a855f7';
    case 'verify':
      return '#14b8a6';
    case 'finalize':
      return '#64748b';
    default:
      return '#f43f5e';
  }
};

const phaseGlyph = (phase: OrchestratorPhase): string => {
  switch (phase) {
    case 'intake':
      return '◉';
    case 'validate':
      return '◐';
    case 'plan':
      return '◈';
    case 'execute':
      return '⬢';
    case 'verify':
      return '⬢';
    case 'finalize':
      return '◍';
    default:
      return '◌';
  }
};

export const OrchestrationTopologyPanel = ({ workspaceId, plans }: OrchestrationTopologyPanelProps) => {
  const diagnostics = useAdvancedOrchestrationDiagnostics({ workspaceId, plans, autoStart: true });

  const nodes = useMemo(
    () =>
      ['intake', 'validate', 'plan', 'execute', 'verify', 'finalize'].map((phase, index) => {
        const status = diagnostics.health === 'ready' ? 'ok' : diagnostics.health === 'failed' ? 'warn' : 'idle';
        const connected = diagnostics.timeline.some((entry) => entry.includes(phase));
        return {
          id: phase,
          x: 84 + index * 130,
          y: 60 + (index % 2) * 22,
          phase: phase as OrchestratorPhase,
          status,
          connected,
        };
      }),
    [diagnostics.health, diagnostics.timeline],
  );

  return (
    <section style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 16, background: '#f8fafc' }}>
      <h3 style={{ marginTop: 0 }}>Orchestration topology</h3>
      <div style={{ position: 'relative', width: '100%', minHeight: 160 }}>
        <svg width="100%" height="160" viewBox="0 0 900 160">
          {nodes.map((node, index) => {
            const x = 120 + index * 140;
            const next = nodes[index + 1];
            return (
              <g key={node.id}>
                {next ? <line x1={x} y1="80" x2={120 + (index + 1) * 140} y2="80" stroke="#94a3b8" strokeWidth={2} /> : null}
                <circle cx={x} cy="80" r={28} fill={phaseColor(node.phase)} opacity={node.connected ? 1 : 0.32} />
                <text x={x} y="85" textAnchor="middle" fill="white" fontWeight={700} fontSize={18}>
                  {phaseGlyph(node.phase)}
                </text>
                <text x={x} y={128} textAnchor="middle" fontSize={12} fill="#334155">
                  {node.id} · {node.status}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <pre
        style={{
          background: '#0f172a',
          color: '#e2e8f0',
          borderRadius: 8,
          padding: 12,
          marginTop: 10,
          fontSize: 12,
          lineHeight: 1.4,
        }}
      >
        {JSON.stringify(
          {
            workspaceId,
            planCount: plans.length,
            health: diagnostics.health,
            anomalies: diagnostics.anomalies,
            timeline: diagnostics.timeline,
            summary: diagnostics.artifactSummary,
          },
          null,
          2,
        )}
      </pre>
    </section>
  );
};
