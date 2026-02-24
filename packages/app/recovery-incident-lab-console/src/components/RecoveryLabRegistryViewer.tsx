import { type ReactElement, useMemo } from 'react';

interface RegistryViewerProps {
  readonly timeline: readonly string[];
}

const parseStage = (entry: string): string => {
  const [scope, action, index] = entry.split(':');
  if (scope && action && index) {
    return `${scope}/${action}`;
  }
  return 'unknown';
};

const groupByPrefix = (entries: readonly string[]): Record<string, number[]> => {
  const output: Record<string, number[]> = {};
  for (const [index, entry] of entries.entries()) {
    const prefix = parseStage(entry);
    output[prefix] = [...(output[prefix] ?? []), index];
  }
  return output;
};

export const RecoveryLabRegistryViewer = ({ timeline }: RegistryViewerProps): ReactElement => {
  const grouped = useMemo(() => groupByPrefix(timeline), [timeline]);
  const groups = useMemo(() => Object.entries(grouped).map(([scope, indexes]) => ({ scope, indexes })), [grouped]);

  return (
    <section className="recovery-lab-registry-viewer">
      <h3>Registry viewer</h3>
      <ul>
        {groups.map((entry) => (
          <li key={entry.scope}>
            <p>{entry.scope}</p>
            <ul>
              {entry.indexes
                .toSorted((left, right) => left - right)
                .map((index) => (
                  <li key={`${entry.scope}-${index}`}>event @ {index}</li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
};
