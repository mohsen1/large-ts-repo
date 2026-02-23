import { ReactNode } from 'react';

export interface StressLabRecommendationsPanelProps {
  lines: ReadonlyArray<string>;
  summary: string;
}

export function StressLabRecommendationsPanel({ lines, summary }: StressLabRecommendationsPanelProps) {
  const rows: ReactNode[] = lines.slice(0, 20).map((line, index) => <li key={`${line}-${index}`}>{line}</li>);

  return (
    <section>
      <h3>Recommendations</h3>
      <p>{summary}</p>
      <ul>{rows}</ul>
    </section>
  );
}
