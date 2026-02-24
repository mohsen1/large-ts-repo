import { useMemo } from 'react';
import { type StreamLabExecutionResult } from '../../stress-lab/types';

export interface PolicyEnginePanelProps {
  readonly result: StreamLabExecutionResult;
  readonly selected: number;
  readonly onSelectRunbook: (runbook: string) => void;
}

type RecommendationEvent = {
  readonly runbook: string;
  readonly weight: number;
};

const normalizeRecommendation = (item: string): RecommendationEvent => {
  const [rawRunbook, rawWeight] = item.split(':');
  return {
    runbook: rawRunbook,
    weight: Number(rawWeight ?? '0'),
  };
};

export const PolicyEnginePanel = ({
  result,
  selected,
  onSelectRunbook,
}: PolicyEnginePanelProps) => {
  const items = useMemo(
    () => result.recommendations.map(normalizeRecommendation).filter((entry) => Number.isFinite(entry.weight)),
    [result.recommendations],
  );

  const bucket = useMemo(() => {
    const map: Record<string, number> = {};
    for (const { runbook, weight } of items) {
      const key = runbook.split('-')[0] ?? runbook;
      map[key] = (map[key] ?? 0) + weight;
    }
    return Object.entries(map).toSorted((left, right) => right[1] - left[1]);
  }, [items]);

  const current = items.at(selected);

  return (
    <section>
      <h3>Policy Engine</h3>
      <p>Total recommendations: {items.length}</p>
      <p>Top bucket: {bucket[0]?.[0] ?? 'none'} ({bucket[0]?.[1]?.toFixed(3) ?? '0.000'})</p>
      <ul>
        {items.map((entry) => (
          <li key={`${entry.runbook}-${entry.weight}`}>
            <button type="button" onClick={() => onSelectRunbook(entry.runbook)}>
              {entry.runbook}
            </button>
            <span> : </span>
            <strong>{entry.weight.toFixed(4)}</strong>
          </li>
        ))}
      </ul>
      <p>Selected runbook: {current?.runbook ?? 'none'}</p>
      <p>Signals: {result.finalSignals.length}</p>
    </section>
  );
};
