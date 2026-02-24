import { type ReactElement, type ReactNode, useMemo } from 'react';
import { type HorizonSignal, type PluginStage, type JsonLike, type HorizonPlan } from '@domain/recovery-horizon-engine';

interface TimelineEntry {
  readonly stage: PluginStage;
  readonly runId: string;
  readonly signalId: string;
  readonly startedAt: string;
  readonly severity: string;
  readonly payload: JsonLike;
}

interface Props {
  readonly plan?: HorizonPlan;
  readonly signals: readonly HorizonSignal<PluginStage, JsonLike>[];
  readonly title: string;
}

const toTimelineEntries = (plan: HorizonPlan | undefined, signals: readonly HorizonSignal<PluginStage, JsonLike>[]): readonly TimelineEntry[] => {
  if (!plan) {
    return signals.map((signal, index) => ({
      stage: signal.kind,
      runId: signal.input.runId,
      signalId: signal.id,
      startedAt: signal.startedAt,
      severity: signal.severity,
      payload: signal.payload,
    }));
  }

  const seed: TimelineEntry = {
    stage: plan.pluginSpan.stage,
    runId: plan.id,
    signalId: plan.id,
    startedAt: new Date(plan.startedAt).toISOString(),
    severity: 'info',
    payload: plan.payload ?? {},
  };

  return [seed, ...signals.map((signal) => ({
    stage: signal.kind,
    runId: signal.input.runId,
    signalId: signal.id,
    startedAt: signal.startedAt,
    severity: signal.severity,
    payload: signal.payload,
  }))];
};

const TimelineRow = ({ entry }: { readonly entry: TimelineEntry }): ReactElement => {
  const tags = useMemo(
    () => Object.entries(entry.payload ?? {}).map(([name, value]) => ({ name, value: String(value) })),
    [entry.payload],
  );

  return (
    <li className={`horizon-row horizon-${entry.stage}`}>
      <span>
        {entry.stage}/{entry.signalId}
      </span>
      <span>run {entry.runId}</span>
      <span>{entry.severity}</span>
      <span>{entry.startedAt}</span>
      <ul>
        {tags.map((tag) => (
          <li key={`${entry.signalId}-${tag.name}`}>{`${tag.name}: ${tag.value}`}</li>
        ))}
      </ul>
    </li>
  );
};

export const HorizonRunTimeline = ({ plan, signals, title }: Props): ReactElement => {
  const entries = toTimelineEntries(plan, signals);
  const grouped = useMemo(() => {
    const groupedMap = new Map<PluginStage, TimelineEntry[]>();
    for (const entry of entries) {
      const bucket = groupedMap.get(entry.stage as PluginStage) ?? [];
      groupedMap.set(entry.stage as PluginStage, [...bucket, entry]);
    }
    return Array.from(groupedMap.entries()).map(([stage, bucket]) => ({ stage, bucket }));
  }, [entries]);

  const details = grouped.map((item) => (
    <section key={item.stage}>
      <h3>{item.stage}</h3>
      <ul>
        {item.bucket.map((entry) => (
          <TimelineRow key={`${entry.signalId}-${entry.startedAt}`} entry={entry} />
        ))}
      </ul>
    </section>
  ));

  return (
    <section className="horizon-timeline">
      <h2>{title}</h2>
      <p>{entries.length} records</p>
      <div>
        {details}
      </div>
    </section>
  );
};
