import { GraphAnalyzer } from './analyzer';
import { DomainGraph } from '@domain/knowledge-graph/builder';

export interface OptimizationPlan {
  action: string;
  reason: string;
  impact: number;
}

export interface ExecutionPlan {
  createdAt: Date;
  graphSize: number;
  plans: OptimizationPlan[];
}

export function plan(graph: DomainGraph): ExecutionPlan {
  const analyzer = new GraphAnalyzer(graph, { sampleSize: graph.nodes.length, maxPathDepth: 12 });
  const result = analyzer.analyze();

  const plans: OptimizationPlan[] = [];
  if (result.cycles > 10) {
    plans.push({ action: 'normalize-cycles', reason: 'too many cycles', impact: 0.8 });
  }
  if (result.longestPath > 20) {
    plans.push({ action: 'split-long-paths', reason: 'query depth optimization', impact: 0.65 });
  }
  if (result.score < 30) {
    plans.push({ action: 'increase-indexing', reason: 'low confidence graph health', impact: 0.45 });
  }

  return {
    createdAt: new Date(),
    graphSize: graph.nodes.length,
    plans,
  };
}

export function emit(plan: ExecutionPlan): string {
  const rows = plan.plans.map((entry) => `${entry.action} (${entry.impact}): ${entry.reason}`).join('\n');
  return `plan-${plan.createdAt.toISOString()}\nnodes=${plan.graphSize}\n${rows}`;
}

export class PlannerService {
  private history: ExecutionPlan[] = [];

  run(graph: DomainGraph): string {
    const next = plan(graph);
    this.history.push(next);
    return emit(next);
  }

  report(): string {
    return this.history
      .map((item) => `${item.createdAt.toISOString()} (${item.plans.length} plans)\n${emit(item)}`)
      .join('\n\n');
  }
}
