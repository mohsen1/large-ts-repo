import { MemoryEventBus, summarizeBySignal } from './events';
import { EnvelopeExporter, TextExporter } from './exporter';
import { runPipeline } from './pipeline';
import { Metric, MetricBuffer, counter } from './telemetry';
import { AlertMatch, PolicyRule, TelemetryEnvelope, TelemetrySample } from '@domain/telemetry-models';
import { InMemoryEnvelopeStore, InMemoryIncidentStore, PolicyStore } from '@data/telemetry-store';
import { S3ArchiveAdapter } from '@data/telemetry-store';

export interface OrchestratorConfig {
  tenantId: string;
  bucket: string;
  windowMs: number;
}

export interface OrchestratorState {
  bufferedMetrics: number;
  lastRunAt: number;
  alerts: number;
}

export class TelemetryOrchestrator {
  private readonly bus: MemoryEventBus;
  private readonly metricBuffer = new MetricBuffer();
  private readonly metricsExport = new TextExporter();
  private readonly envelopeExport = new EnvelopeExporter();
  private readonly policies: PolicyStore;
  private readonly envelopes: InMemoryEnvelopeStore;
  private readonly incidents: InMemoryIncidentStore;
  private readonly archive: S3ArchiveAdapter;
  private readonly counters = {
    processed: counter('telemetry.processed'),
    errors: counter('telemetry.errors'),
  };
  private state: OrchestratorState = { bufferedMetrics: 0, lastRunAt: 0, alerts: 0 };

  constructor(config: OrchestratorConfig) {
    this.bus = new MemoryEventBus({ dedupeByFingerprint: true, limit: 2_000 });
    this.policies = new PolicyStore();
    this.envelopes = new InMemoryEnvelopeStore();
    this.incidents = new InMemoryIncidentStore();
    this.archive = new S3ArchiveAdapter(config.bucket);
    this.bus.on('metric', () => {});
    void config;
  }

  async seedPolicies(policies: readonly PolicyRule[]): Promise<void> {
    for (const rule of policies) {
      await this.policies.save(rule);
    }
  }

  async ingest(samples: readonly TelemetrySample[]): Promise<void> {
    for (const sample of samples) {
      this.counters.processed.increment();
      if (sample.signal === 'metric') {
        this.metricBuffer.add({
          ...sample.payload,
          tags: sample.tags,
          value: (sample.payload as { value?: number }).value ?? 0,
          unit: 'count',
        });
      }
      this.state.bufferedMetrics = this.metricBuffer.length();
    }

    const activePolicies = await this.policies.all();
    const run = await runPipeline({ samples, policies: activePolicies, boundaryWindowMs: 60_000 });
    this.state.alerts += run.matches.length;

    for (const match of run.matches) {
      const incident = {
        id: `${match.id}-incident` as any,
        tenantId: match.tenantId,
        streamId: '' as any,
        matchedRule: activePolicies[0]!,
        events: [],
        severity: match.severity,
        resolved: false,
        seenAt: Date.now(),
      };
      await this.incidents.save(incident as never);
    }

    await this.publish(run.envelopes);
    const payload = run.matches.map((match) => match.reason).join('\n');
    this.counters.errors.increment({}, Math.max(0, run.envelopes.length));
    this.state.lastRunAt = Date.now();
    void payload;
  }

  async publish(envelopes: readonly TelemetryEnvelope[]): Promise<void> {
    for (const envelope of envelopes) {
      await this.bus.publishEnvelope(envelope);
    }
    await this.envelopes.saveMany(envelopes);
    this.metricsExport.toNdjson(this.metricBuffer.flush().map((metric) => ({
      name: metric.name,
      value: metric.value,
      tags: metric.tags,
      at: Date.now(),
    })));
    this.envelopeExport.toJson(envelopes);
  }

  async snapshot(): Promise<string> {
    const tenantBuckets = summarizeBySignal(await this.envelopes.listByTenant('' as any, { limit: 100 }));
    const counts = Object.entries(tenantBuckets).map(([tenant, count]) => `${tenant}:${count}`).join('\n');
    const archive = await this.archive.put(await this.envelopes.listByTenant('' as any, { limit: 100 }).then((result) => result.items));
    return `${counts}\n${archive.bucket}/${archive.key}`;
  }

  getState(): OrchestratorState {
    return { ...this.state };
  }
}
