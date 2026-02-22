import { Metric } from './telemetry';

export interface MetricExport {
  toPrometheus(metrics: readonly Metric[]): string;
  toJson(metrics: readonly Metric[]): string;
}

export class TextExporter implements MetricExport {
  toPrometheus(metrics: readonly Metric[]): string {
    return metrics.map((metric) => `${metric.name} ${metric.value}`).join('\n');
  }
  toJson(metrics: readonly Metric[]): string {
    return JSON.stringify(metrics);
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
}

function chunk(metrics: readonly Metric[]): readonly Metric[] {
  return [...metrics];
}
