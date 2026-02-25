import { memo, type ReactElement } from 'react';
import type { WorkbenchSnapshot } from '../types';

interface WorkbenchTimelineDeckProps {
  readonly snapshots: readonly WorkbenchSnapshot[];
}

export const WorkbenchTimelineDeck = memo(function WorkbenchTimelineDeck({
  snapshots,
}: WorkbenchTimelineDeckProps): ReactElement {
  const sorted = [...snapshots].toReversed().filter((snapshot) => snapshot.timeline.length > 0);

  return (
    <section>
      <h3>Execution Timeline</h3>
      <ul>
        {sorted.map((snapshot) => {
          const statusLabel = `${snapshot.status} · ${snapshot.runId}`;
          const elapsed = `${snapshot.elapsedMs}ms`;
          return (
            <li key={`${snapshot.runId}-${snapshot.tenant}-${snapshot.workspace}-${snapshot.stage}`}>
              <article>
                <header>
                  <h4>{statusLabel}</h4>
                  <p>{`stage=${snapshot.stage}`}</p>
                </header>
                <p>{`elapsed=${elapsed}`}</p>
                <p>{`routeHints=${snapshot.metadata.routeHint ?? 'unknown'}`}</p>
                <p>{`plugins=${snapshot.timeline.length}`}</p>
                <ol>
                  {snapshot.timeline.map((entry, index) => (
                    <li key={`${snapshot.runId}-${entry}-${index}`}>{entry}</li>
                  ))}
                </ol>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
