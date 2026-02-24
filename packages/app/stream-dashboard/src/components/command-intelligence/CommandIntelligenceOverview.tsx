import { useMemo } from 'react';
import { CommandSignalEnvelope } from '@domain/streaming-command-intelligence';

interface CommandIntelligenceOverviewProps {
  readonly streamId: string;
  readonly status: string | null;
  readonly loading: boolean;
  readonly namespaces: readonly string[];
  readonly envelopes: readonly CommandSignalEnvelope[];
  readonly summary: Record<string, number>;
}

const bucketizeSeverity = (envelopes: readonly CommandSignalEnvelope[]): Record<'critical' | 'major' | 'minor', number> => {
  return envelopes.reduce(
    (acc, envelope) => {
      if (envelope.context?.status === 'failed') {
        acc.critical += 1;
      } else if ((envelope.context?.latencyMs ?? 0) > 250) {
        acc.major += 1;
      } else {
        acc.minor += 1;
      }
      return acc;
    },
    { critical: 0, major: 0, minor: 0 },
  );
};

const latestMessages = (envelopes: readonly CommandSignalEnvelope[]): readonly string[] => {
  return envelopes
    .slice(-10)
    .map((entry) => `${entry.seenAt} ${entry.namespace} ${entry.pluginKind} ${entry.context?.pluginName ?? 'unknown'}`);
};

const namespaceCounts = (namespaces: readonly string[]): string =>
  [...new Set(namespaces)]
    .map((namespace) => `#${namespace}`)
    .join(', ');

const summaryRows = (summary: Record<string, number>): readonly [string, number][] =>
  Object.entries(summary).sort(([left], [right]) => left.localeCompare(right));

const severityLabel = (severity: keyof ReturnType<typeof bucketizeSeverity>): string =>
  severity === 'critical' ? 'Critical' : severity === 'major' ? 'Major' : 'Minor';

export const CommandIntelligenceOverview = ({
  streamId,
  status,
  loading,
  namespaces,
  envelopes,
  summary,
}: CommandIntelligenceOverviewProps) => {
  const severity = useMemo(() => bucketizeSeverity(envelopes), [envelopes]);
  const messages = useMemo(() => latestMessages(envelopes), [envelopes]);
  const rows = useMemo(() => summaryRows(summary), [summary]);
  const namespaceText = useMemo(() => namespaceCounts(namespaces), [namespaces]);

  return (
    <section>
      <h2>Command Intelligence Overview</h2>
      <p>Stream: {streamId}</p>
      <p>Run status: {status ?? 'idle'}</p>
      <p>Loading: {String(loading)}</p>
      <p>Active namespaces: {namespaceText}</p>
      <div>
        <strong>Severity</strong>
        <ul>
          {(Object.entries(severity) as Array<[keyof ReturnType<typeof bucketizeSeverity>, number]>).map(([bucket, count]) => (
            <li key={bucket}>
              {severityLabel(bucket)}: {count}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <strong>Namespace counts</strong>
        <ul>
          {rows.map(([namespace, count]) => (
            <li key={`${namespace}-${count}`}>
              {namespace}: {count}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <strong>Signal log</strong>
        <ul>
          {messages.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};
