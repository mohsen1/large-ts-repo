const laneOrder = ['recovery', 'performance', 'stability', 'compliance'] as const;

const pill = {
  border: '1px solid rgba(148,163,184,0.28)',
  borderRadius: '0.55rem',
  padding: '0.35rem 0.6rem',
};

export const RecoveryPlaybookLabSignals = ({
  lanes = laneOrder,
  refresh,
}: {
  readonly lanes?: readonly string[];
  readonly refresh: () => void;
}) => {
  return (
    <section style={{ display: 'grid', gap: '0.65rem' }}>
      <h4 style={{ margin: 0 }}>Signal lanes</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {lanes.map((lane, index) => (
          <button
            key={lane}
            onClick={refresh}
            style={{
              ...pill,
              background: `linear-gradient(120deg, rgba(${20 + index * 35}, 80, 130, 0.35), rgba(15, 23, 42, 0.55))`,
              color: '#e2e8f0',
            }}
            type="button"
          >
            {lane}
          </button>
        ))}
      </div>
    </section>
  );
};
