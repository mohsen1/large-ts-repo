interface SignalSeriesCardProps {
  readonly signals: readonly { readonly id: string; readonly title: string; readonly tier: string; readonly score: number }[];
  readonly title: string;
}

export const SignalSeriesCard = ({ signals, title }: SignalSeriesCardProps) => {
  return (
    <section className="signal-series-card">
      <h3>{title}</h3>
      <ul>
        {signals.map((signal) => (
          <li key={signal.id}>
            {signal.title} · {signal.tier} · {signal.score.toFixed(2)}
          </li>
        ))}
      </ul>
    </section>
  );
};
