interface GraphOpsSignalTimelineProps {
  readonly signals: readonly {
    readonly id: string;
    readonly label: string;
    readonly severity: number;
    readonly at: string;
    readonly values: readonly number[];
  }[];
}

export const GraphOpsSignalTimeline = ({ signals }: GraphOpsSignalTimelineProps) => {
  return (
    <section style={{ border: '1px solid #2f3850', borderRadius: 12, padding: '0.7rem', background: '#121a2b' }}>
      <h2>Signal timeline</h2>
      <ol style={{ display: 'grid', gap: '0.5rem', listStyle: 'none', margin: 0, padding: 0 }}>
        {signals.map((signal) => (
          <li
            key={signal.id}
            style={{
              border: '1px solid #253040',
              borderRadius: 8,
              padding: '0.4rem',
              display: 'grid',
              gap: '0.3rem',
            }}
          >
            <strong>{signal.label}</strong>
            <small>
              severity {signal.severity} · at {signal.at}
            </small>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              {signal.values.map((value, index) => (
                <span
                  key={`${signal.id}-value-${index}`}
                  style={{
                    background: 'rgba(99,102,241,0.2)',
                    borderRadius: 999,
                    padding: '0.15rem 0.4rem',
                  }}
                >
                  {value.toFixed(1)}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {signals.length === 0 ? <p>No signal telemetry yet</p> : null}
    </section>
  );
};
