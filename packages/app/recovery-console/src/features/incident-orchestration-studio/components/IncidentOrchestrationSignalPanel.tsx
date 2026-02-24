import type { PluginBusEvent } from '../hooks/useIncidentOrchestrationStudio';

interface IncidentOrchestrationSignalPanelProps {
  readonly events: readonly PluginBusEvent[];
  readonly isStreaming: boolean;
  readonly phaseCounts: ReadonlyMap<string, number>;
  readonly onClear: () => void;
}

const phaseOrder = ['observe', 'discover', 'assess', 'simulate', 'verify', 'actuate'] as const;

export const IncidentOrchestrationSignalPanel = ({
  events,
  isStreaming,
  phaseCounts,
  onClear,
}: IncidentOrchestrationSignalPanelProps) => {
  return (
    <section style={{ border: '1px solid #334155', borderRadius: 10, padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Signal stream</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span style={{ color: isStreaming ? '#22c55e' : '#94a3b8' }}>
            {isStreaming ? 'streaming' : 'stopped'}
          </span>
          <button type="button" onClick={onClear} style={{ borderRadius: 6 }}>
            clear
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.4rem' }}>
        {phaseOrder.map((phase) => {
          const count = phaseCounts.get(phase) ?? 0;
          return (
            <div key={phase} style={{ border: '1px solid #334155', borderRadius: 8, padding: '0.5rem' }}>
              <p style={{ margin: 0, color: '#94a3b8' }}>{phase}</p>
              <strong>{count}</strong>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gap: '0.4rem', maxHeight: 240, overflow: 'auto' }}>
        {events.slice(0, 18).map((event) => (
          <article key={`${event.phase}-${event.pluginId}`} style={{ borderBottom: '1px solid #1e293b', paddingBottom: '0.35rem' }}>
            <p style={{ margin: 0 }}>
              <strong>{event.pluginName}</strong> · {event.phase}
            </p>
            <p style={{ margin: 0, color: '#94a3b8' }}>{event.pluginId}</p>
            <p style={{ margin: 0, fontSize: '0.8rem' }}>{event.diagnostics.join(' · ')}</p>
          </article>
        ))}
      </div>
    </section>
  );
};
