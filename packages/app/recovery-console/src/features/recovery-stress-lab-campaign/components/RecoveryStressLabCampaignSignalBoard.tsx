import { memo, useMemo } from 'react';

interface SignalBoardProps {
  readonly campaign: string;
  readonly signals: readonly { readonly id: string; readonly label: string; readonly score: number }[];
  readonly route: readonly string[];
  readonly onQuery: (query: string) => void;
}

const scoreBand = (score: number) => {
  if (score >= 80) {
    return 'critical';
  }
  if (score >= 55) {
    return 'high';
  }
  if (score >= 25) {
    return 'medium';
  }
  return 'low';
};

export const RecoveryStressLabCampaignSignalBoard = memo((props: SignalBoardProps) => {
  const ranked = useMemo(
    () => [...props.signals].toSorted((a, b) => b.score - a.score),
    [props.signals],
  );

  return (
    <section>
      <h2>Signal Board</h2>
      <p>{`campaign ${props.campaign}`}</p>
      <p>{`route ${props.route.join(' / ')}`}</p>
      <label>
        query
        <input
          type="search"
          onChange={(event) => {
            const next = event.target.value.trim().toLowerCase();
            props.onQuery(next);
          }}
          placeholder="filter signals"
        />
      </label>
      <ul>
        {ranked.map((entry) => (
          <li key={entry.id}>{`${entry.id} - ${entry.label} (${scoreBand(entry.score)})`}</li>
        ))}
      </ul>
    </section>
  );
});

RecoveryStressLabCampaignSignalBoard.displayName = 'RecoveryStressLabCampaignSignalBoard';
