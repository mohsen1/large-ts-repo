import { PlannerService } from '@service/graph-intelligence';
import { TelemetryOrchestrator } from '@service/telemetry';
import { DomainGraph } from '@domain/knowledge-graph/builder';
import { GraphType } from '@domain/knowledge-graph/schema';
import { TelemetryEnvelope, AlertMatch, NormalizedTelemetrySample } from '@domain/telemetry-models';

export interface DashboardConfig {
  tenant: string;
}

export async function renderDashboard(config: DashboardConfig, graph: DomainGraph): Promise<string> {
  const planner = new PlannerService();
  const plan = planner.run(graph);
  return `tenant=${config.tenant}\n${plan}\ncreated:${new Date().toISOString()}`;
}

export async function renderTelemetrySummary(
  tenantId: string,
  samples: readonly NormalizedTelemetrySample[],
  alerts: readonly AlertMatch[],
): Promise<{ tenantId: string; signalCount: number; criticalAlerts: number }> {
  const orchestrator = new TelemetryOrchestrator({ tenantId, bucket: 'unused', windowMs: 60_000 });
  await orchestrator.ingest(samples);
  return {
    tenantId,
    signalCount: samples.length,
    criticalAlerts: alerts.filter((alert) => alert.severity === 'critical').length,
  };
}

export function summarizeSignals(envelopes: ReadonlyArray<TelemetryEnvelope>): string[] {
  const aggregate = new Map<string, number>();
  for (const envelope of envelopes) {
    aggregate.set(envelope.sample.signal, (aggregate.get(envelope.sample.signal) ?? 0) + 1);
  }
  return [...aggregate.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([signal]) => signal);
}

export function bootstrap(): DomainGraph {
  const graphType = new GraphType({
    id: 'insights',
    name: 'insights',
    nodes: new Map(),
    edges: new Map(),
  });
  return new DomainGraph(graphType, [], []);
}

export function withDefaults(value?: string): string {
  return value?.trim() || 'unknown';
}
