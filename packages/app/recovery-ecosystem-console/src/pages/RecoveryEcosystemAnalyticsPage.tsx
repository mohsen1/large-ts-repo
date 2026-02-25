import { useMemo, type ReactElement, useState } from 'react';
import { useEcosystemAnalytics } from '../hooks/useEcosystemAnalytics';
import { useEcosystemSignalStream } from '../hooks/useEcosystemSignalStream';
import { AnalyticsMetricCard } from '../components/AnalyticsMetricCard';
import { SignalTimelinePanel } from '../components/SignalTimelinePanel';
import { SignalMatrixPanel } from '../components/SignalMatrixPanel';
import { ScenarioSimulationPanel } from '../components/ScenarioSimulationPanel';
import type { AnalyticsSignalSummary } from '@domain/recovery-ecosystem-analytics';
import { asTenant, asNamespace } from '@domain/recovery-ecosystem-analytics';

const metricDefaults = {
  score: 0,
  confidence: 0,
  signals: 0,
  warnings: 0,
  critical: 0,
};

const normalizeSummary = (summary: AnalyticsSignalSummary | undefined): {
  readonly score: number;
  readonly confidence: number;
  readonly signals: number;
  readonly warnings: number;
  readonly critical: number;
} => ({
  score: summary?.score ?? metricDefaults.score,
  confidence: Math.min(1, Math.max(0, 1 - (summary?.criticalCount ?? 0) / 8)),
  signals: summary?.signalCount ?? metricDefaults.signals,
  warnings: summary?.warningCount ?? metricDefaults.warnings,
  critical: summary?.criticalCount ?? metricDefaults.critical,
});

export const RecoveryEcosystemAnalyticsPage = ({
  tenantId = 'tenant:default',
  namespace = 'namespace:recovery-ecosystem',
}: {
  tenantId?: string;
  namespace?: string;
}): ReactElement => {
  const tenant = asTenant(tenantId);
  const ns = asNamespace(namespace);
  const analytics = useEcosystemAnalytics(tenant, ns);
  const stream = useEcosystemSignalStream({ tenant, namespace: ns });
  const [selectedSignal, setSelectedSignal] = useState<string>('');

  const normalized = useMemo(() => normalizeSummary(analytics.summary), [analytics.summary]);
  const eventTrace = useMemo(() => analytics.eventTrace.toSorted().slice(0, 12), [analytics.eventTrace]);

  const onRun = async () => {
    await analytics.run({
      tenant: tenantId,
      namespace,
      signalKinds: ['ingest', 'evaluate', 'score'],
    });
  };

  return (
    <main>
      <header>
        <h1>Recovery Ecosystem Analytics</h1>
        <p>tenant={tenant} namespace={ns}</p>
      </header>
      <section>
        <AnalyticsMetricCard
          title="Health Score"
          value={normalized.score}
          max={100}
          trend={[normalized.warnings, normalized.critical, normalized.signals]}
          label="Live signal quality"
        />
        <AnalyticsMetricCard
          title="Confidence"
          value={Math.round(normalized.confidence * 100)}
          max={100}
          trend={[100, normalized.signals, normalized.critical]}
          label="Forecast confidence"
        />
        <ScenarioSimulationPanel
          loading={analytics.loading}
          namespace={ns}
          mode={analytics.mode === 'overview' ? 'seed' : analytics.mode === 'drill' ? 'simulate' : 'replay'}
          summary={analytics.summary}
          onRun={onRun}
          onReset={analytics.clear}
        />
      </section>
      <section>
        <button type="button" onClick={() => void stream.open()} disabled={stream.status === 'open'}>
          open stream
        </button>
        <button type="button" onClick={() => void stream.appendMock('simulate')} disabled={stream.status !== 'open'}>
          mock event
        </button>
        <button type="button" onClick={() => void stream.close()} disabled={stream.status !== 'open'}>
          close stream
        </button>
        <SignalTimelinePanel
          events={stream.events}
          namespace={namespace}
          onSelect={(signature) => setSelectedSignal(signature)}
        />
      </section>
      <section>
        <h2>Trace</h2>
        <p>{`selected=${selectedSignal || 'none'}`}</p>
        <p>{`stream-status=${stream.status} session=${stream.activeSession ?? 'none'}`}</p>
        <ul>
          {eventTrace.map((trace) => (
            <li key={trace}>{trace}</li>
          ))}
        </ul>
        <SignalMatrixPanel events={stream.events} onInspect={(session) => setSelectedSignal(session)} />
      </section>
      <p>recent trace entries: {analytics.eventTrace.length}</p>
    </main>
  );
};
