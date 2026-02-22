import { DomainGraph } from '@domain/knowledge-graph/builder';
import { analyze, explain } from '@domain/knowledge-graph/query';

export interface ExecutionStep {
  id: string;
  name: string;
  run: () => Promise<void> | void;
  retries: number;
}

export interface ExecutionPlan {
  id: string;
  steps: ExecutionStep[];
}

export interface ExecutionResult {
  ok: boolean;
  elapsedMs: number;
  outputs: string[];
}

export class ExecutionEngine {
  async run(plan: ExecutionPlan): Promise<ExecutionResult> {
    const start = Date.now();
    const outputs: string[] = [];
    for (const step of plan.steps) {
      let attempt = 0;
      while (true) {
        try {
          await step.run();
          outputs.push(`step=${step.id}:ok`);
          break;
        } catch (error) {
          attempt += 1;
          outputs.push(`step=${step.id}:failed#${attempt}`);
          if (attempt > step.retries) {
            throw error;
          }
        }
      }
    }
    return { ok: true, elapsedMs: Date.now() - start, outputs };
  }
}

export async function executeGraph(graph: DomainGraph, root: string): Promise<ExecutionPlan> {
  const result = analyze(graph, { root, maxDepth: 9, includeMetadata: false });
  const steps = result.nodes.map((node, index) => ({
    id: `${index}-${node}`,
    name: `process-${node}`,
    run: async () => {
      await Promise.resolve(explain(graph, { root: node, maxDepth: 2, includeMetadata: true }));
    },
    retries: 2,
  }));

  return { id: `plan-${root}`, steps };
}
