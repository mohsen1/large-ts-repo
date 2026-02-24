import { Fragment, type ReactElement } from 'react';
import type { HorizonSignal, JsonLike, PluginStage } from '@domain/recovery-horizon-engine';
import type { ReadWindowResult, WindowTrend } from '../types';

interface HorizonSignalsFeedProps {
  readonly readResult: ReadWindowResult;
  readonly trend: readonly WindowTrend[];
  readonly onCopy: (value: string) => void;
}

interface SignalCard {
  readonly stage: PluginStage;
  readonly signal: HorizonSignal<PluginStage, JsonLike>;
  readonly index: number;
}

const severityLabel = (severity: HorizonSignal<PluginStage, JsonLike>['severity']): string => {
  if (severity === 'critical') {
    return 'critical';
  }
  if (severity === 'high') {
    return 'high';
  }
  if (severity === 'medium') {
    return 'medium';
  }
  return 'low';
};

const renderSignal = (signal: HorizonSignal<PluginStage, JsonLike>): string =>
  JSON.stringify(
    {
      id: signal.id,
      kind: signal.kind,
      startedAt: signal.startedAt,
      tenantId: signal.input.tenantId,
      runId: signal.input.runId,
      tags: signal.input.tags,
      payload: signal.payload,
    },
    null,
    2,
  );

const mapSignals = (records: readonly HorizonSignal<PluginStage, JsonLike>[], max = 15): SignalCard[] =>
  records.slice(-max).map((signal, index) => ({
    stage: signal.kind,
    signal,
    index,
  }));

export const HorizonSignalsFeed = ({ readResult, trend, onCopy }: HorizonSignalsFeedProps): ReactElement => {
  if (!readResult.ok) {
    return (
      <section className="horizon-signals-feed">
        <h2>No signal data</h2>
        <p>No records were available for this view.</p>
      </section>
    );
  }

  const cards = mapSignals(readResult.read.items.map((item) => item.signal), 24);

  return (
    <section className="horizon-signals-feed">
      <header>
        <h2>Signals</h2>
        <p>
          rows: {readResult.read.total}, trend: {trend.filter((entry) => entry.count > 0).length}
        </p>
      </header>
      <ul>
        {cards.map((entry) => (
          <li key={`${entry.signal.id}-${entry.index}`}>
            <details>
              <summary>{entry.stage} · {severityLabel(entry.signal.severity)} · {entry.signal.startedAt}</summary>
              <pre>{renderSignal(entry.signal)}</pre>
              <button
                type="button"
                onClick={() => onCopy(renderSignal(entry.signal))}
              >
                Copy JSON
              </button>
            </details>
          </li>
        ))}
      </ul>
      <h3>Trend bands</h3>
      <ul>
        {trend.map((entry) => (
          <Fragment key={entry.stage}>
            <li>
              {entry.stage}: {entry.count} ({Math.round(entry.ratio * 100)}%)
            </li>
          </Fragment>
        ))}
      </ul>
    </section>
  );
};
