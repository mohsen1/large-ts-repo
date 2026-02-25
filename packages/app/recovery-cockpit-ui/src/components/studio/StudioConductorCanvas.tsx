import { type PluginId, type StudioRunOutput } from '@shared/cockpit-studio-core';
import { useStudioTimeline } from '../../hooks/useStudioTimeline';

type CanvasProps = {
  readonly pluginIds: readonly PluginId[];
  readonly run?: StudioRunOutput;
};

const statusColor = (status: string): string => {
  switch (status) {
    case 'error':
      return '#dc2626';
    case 'running':
      return '#2563eb';
    case 'queued':
      return '#94a3b8';
    case 'complete':
      return '#16a34a';
    default:
      return '#0f766e';
  }
};

export const StudioConductorCanvas = ({ pluginIds, run }: CanvasProps) => {
  const timeline = useStudioTimeline(run);
  const spacing = 120;
  const nodes = pluginIds.toSorted();
  return (
    <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 12, background: '#020617', color: '#e2e8f0' }}>
      <h3 style={{ marginTop: 0 }}>Conductor path</h3>
      <svg width="100%" height={140} viewBox={`0 0 ${Math.max(1, nodes.length) * spacing + 64} 140`} style={{ width: '100%' }}>
        <rect x={0} y={0} width={Math.max(1, nodes.length) * spacing + 64} height={140} fill="#0f172a" />
        {nodes.map((pluginId, index) => {
          const x = 72 + index * spacing;
          const y = 70;
          const next = nodes[index + 1];
          const nodeState = timeline.nodes.find((entry) => entry.pluginId === pluginId);
          const status = nodeState?.status ?? 'queued';
          return (
            <g key={pluginId}>
              {next ? (
                <line
                  x1={x + 14}
                  y1={y}
                  x2={x + spacing}
                  y2={y}
                  stroke="#475569"
                  strokeWidth={2}
                  strokeDasharray="4 6"
                />
              ) : null}
              <circle cx={x} cy={y} r={20} fill={statusColor(status)} />
              <text x={x} y={78} textAnchor="middle" fill="white" fontSize={9}>
                {pluginId.split(':')[1]?.slice(0, 18) ?? 'node'}
              </text>
              <text x={x} y={96} textAnchor="middle" fill="#cbd5e1" fontSize={8}>
                {status}
              </text>
            </g>
          );
        })}
      </svg>
      <pre style={{ marginTop: 12, maxHeight: 180, overflow: 'auto', fontSize: 12 }}>
        {JSON.stringify(
          timeline.nodes.map((entry) => ({
            index: entry.index,
            pluginId: entry.pluginId,
            at: entry.at,
            eventKind: entry.eventKind,
            payloadKeyCount: entry.payloadKeyCount,
            status: entry.status,
          })),
          null,
          2,
        )}
      </pre>
    </section>
  );
};
