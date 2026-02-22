import { PlannerService } from '@service/graph-intelligence';
import { DomainGraph } from '@domain/knowledge-graph/builder';
import { GraphType } from '@domain/knowledge-graph/schema';

export interface DashboardConfig {
  tenant: string;
}

export async function renderDashboard(config: DashboardConfig, graph: DomainGraph): Promise<string> {
  const planner = new PlannerService();
  const plan = planner.emit(planner.run(graph) as any);
  return `tenant=${config.tenant}\n${plan}\ncreated:${new Date().toISOString()}`;
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
