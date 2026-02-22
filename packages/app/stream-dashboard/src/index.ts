import { StreamMetrics } from '@domain/streaming-engine/types';

export interface DashboardConfig {
  tenant: string;
}

export function render(metrics: readonly StreamMetrics[]): string {
  const lines: string[] = [];
  for (const metric of metrics) {
    lines.push(`${metric.stream}|lag=${metric.lag}|eps=${metric.throughput.eventsPerSecond}`);
  }
  return lines.join('\n');
}

export function status(metrics: readonly StreamMetrics[], config: DashboardConfig): string {
  return `${config.tenant}\n${render(metrics)}`;
}
