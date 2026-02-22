import { normalizeLimit, Brand } from '@shared/core';
import { Metric, MetricSnapshot } from './telemetry';
import { TelemetryEnvelope } from '@domain/telemetry-models';

export interface MetricExport {
  toPrometheus(metrics: readonly Metric[]): string;
  toJson(metrics: readonly Metric[]): string;
  toNdjson(metrics: readonly Metric[]): string;
}

export interface EnvelopeExport {
  toJson(envelopes: readonly TelemetryEnvelope[]): string;
}

export class TextExporter implements MetricExport {
  toPrometheus(metrics: readonly Metric[]): string {
    return metrics.map((metric) => `${metric.name} ${metric.value}`).join('\n');
  }
  toJson(metrics: readonly Metric[]): string {
    return JSON.stringify(metrics, null, 2);
  }
  toNdjson(metrics: readonly Metric[]): string {
    return metrics.map((metric) => `${metric.name} ${metric.value} ${(JSON.stringify(metric.tags))}`).join('\n');
  }
}

export class BatchedExporter implements MetricExport {
  constructor(private readonly exporter: MetricExport = new TextExporter()) {}

  toPrometheus(metrics: readonly Metric[]): string {
    return this.exporter.toPrometheus(chunk(metrics));
  }
  toJson(metrics: readonly Metric[]): string {
    return this.exporter.toJson(metrics);
  }
  toNdjson(metrics: readonly Metric[]): string {
    return this.exporter.toNdjson(chunk(metrics));
  }
}

export class EnvelopeExporter implements EnvelopeExport {
  toJson(envelopes: readonly TelemetryEnvelope[]): string {
    return JSON.stringify(envelopes, null, 2);
  }
}

export class SlidingWindowExporter {
  private readonly window = new Map<string, Metric[]>();
  constructor(private readonly bucketMs: number = 60_000) {}

  push(snapshot: MetricSnapshot): string {
    const id = (snapshot.metrics[0]?.at ?? Date.now()) as Brand<number, 'bucket'>;
    const key = String(Math.floor(id / this.bucketMs) * this.bucketMs);
    const bucket = this.window.get(key) ?? [];
    bucket.push(...snapshot.metrics);
    this.window.set(key, bucket);
    return key;
  }

  flushOlder(before: number): string[] {
    const out: string[] = [];
    for (const [key, metrics] of this.window) {
      if (Number(key) < before) {
        out.push(this.toPayload(key, metrics));
        this.window.delete(key);
      }
    }
    return out;
  }

  private toPayload(key: string, metrics: Metric[]): string {
    return `${key} ${normalizeLimit(metrics.length)}`;
  }
}

function chunk(metrics: readonly Metric[]): readonly Metric[] {
  return [...metrics];
}
