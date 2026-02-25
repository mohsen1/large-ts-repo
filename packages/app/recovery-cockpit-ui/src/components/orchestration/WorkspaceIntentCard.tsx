import { type FC } from 'react';

export interface WorkspaceIntentCardProps {
  readonly intentName: string;
  readonly labels: readonly string[];
  readonly confidence: number;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

export const WorkspaceIntentCard: FC<WorkspaceIntentCardProps> = ({
  intentName,
  labels,
  confidence,
  selected,
  onSelect,
}) => {
  return (
    <article
      style={{
        border: `1px solid ${selected ? '#49f' : '#223'}`,
        borderRadius: 8,
        padding: 12,
      }}
      onClick={onSelect}
    >
      <h3>{intentName}</h3>
      <ul>
        {labels.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
      <p>Confidence {Math.round(confidence * 100)}%</p>
      <progress value={confidence} max={1} />
    </article>
  );
};
