export interface QuantumTimelineEntry {
  readonly stage: string;
  readonly plugin: string;
  readonly latencyMs: number;
}

export interface QuantumSynthesisTimelinePanelProps {
  readonly events: readonly QuantumTimelineEntry[];
  readonly title: string;
}

export const QuantumSynthesisTimelinePanel = ({ events, title }: QuantumSynthesisTimelinePanelProps) => {
  const maxLatency = events.reduce((current, event) => {
    return event.latencyMs > current ? event.latencyMs : current;
  }, 0);

  return (
    <section style={{ border: '1px solid #d0d0d0', borderRadius: 12, padding: 12 }}>
      <h3>{title}</h3>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {events.map((event, index) => {
          const intensity = maxLatency === 0 ? 0.05 : event.latencyMs / maxLatency;
          return (
            <li key={`${event.plugin}-${index}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>{event.stage}</strong>
                <span style={{ opacity: 0.7 }}>{event.plugin}</span>
              </div>
              <div style={{ opacity: 0.7 }}>
                latency: {event.latencyMs}ms · {Math.round(intensity * 100)}%
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
