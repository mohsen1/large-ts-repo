interface ThroughputGaugeProps {
  score: number;
  scenarioId: string;
}

export const ThroughputGauge = ({ score, scenarioId }: ThroughputGaugeProps) => {
  const safeScore = Number(score.toFixed(2));
  const value = Math.max(0, Math.min(100, safeScore));
  const status = value >= 75 ? 'green' : value >= 40 ? 'amber' : 'red';

  return (
    <article style={{ border: '1px solid #333', padding: '10px' }}>
      <h3>Throughput Score</h3>
      <div>
        <strong style={{ color: status }}>{value}%</strong> · {scenarioId}
      </div>
      <meter min={0} max={100} value={value} />
    </article>
  );
};
