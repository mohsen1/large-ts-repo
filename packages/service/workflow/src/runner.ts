import { WorkflowDef, createState, progress, mark, mark as markStep } from '@domain/workflow';
import { InMemoryWorkflowRegistry } from '@domain/workflow/registry';

export interface RunnerConfig {
  name: string;
  registry: InMemoryWorkflowRegistry;
}

export class WorkflowRunner {
  constructor(private readonly config: RunnerConfig) {}

  async run(defId: string): Promise<void> {
    const def = this.config.registry.get(defId as any);
    if (!def) return;

    const ctx = createState(def as WorkflowDef);
    for (let i = 0; i < 10; i++) {
      const available = progress(ctx);
      if (available.length === 0) break;
      for (const step of available) {
        markStep(ctx as any, step, 'running');
        await this.executeStep(step);
        markStep(ctx as any, step, 'done');
      }
    }
  }

  private async executeStep(step: string): Promise<void> {
    const delay = Math.min(100, step.length * 5);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
