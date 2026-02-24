import type { LabExecutionResult, LabExecution, LabLane, LabScenario, RunCatalog } from './models';
import { createTopology, routeTraversal } from './topology';
import { createCatalog, type TemplateCatalog, type Template } from './templates';

interface ExecutionState {
  readonly id: string;
  readonly startedAt: number;
  readonly status: 'queued' | 'running' | 'completed' | 'errored';
}

export class WorkflowAssembler {
  readonly #catalog: TemplateCatalog<readonly Template<string, any>[]>;

  public constructor(
    private readonly catalog: RunCatalog,
    private readonly mode: 'strict' | 'adaptive',
  ) {
    const template = createCatalog('simulate');
    this.#catalog = template;
  }

  public buildExecutionMap(): ReadonlyMap<string, readonly string[]> {
    const out = new Map<string, string[]>();
    for (const scenario of this.catalog.scenarios) {
      const topology = createTopology(scenario.lane, scenario.signals.map((signal) => signal.name));
      const path = routeTraversal(
        new Map<string, string[]>(topology.edges.map((edge) => [edge.from, [edge.to]])),
        topology.nodes[0]?.id ?? `${scenario.scenarioId}`,
      );
      out.set(scenario.scenarioId, [...path]);
    }
    return out;
  }

  public selectTemplates<TKind extends LabLane>(kind: TKind): readonly Template<string, TKind>[] {
    return (this.#catalog.templates as readonly Template<string, TKind>[]).filter((template) => template.kind === kind);
  }

  public statusFromResult(result: LabExecutionResult): 'ok' | 'degraded' | 'blocked' {
    if (result.status === 'passed' && result.health > 0.8) {
      return 'ok';
    }
    if (result.status === 'failed') {
      return 'blocked';
    }
    return 'degraded';
  }

  public summarize(execution: LabExecution): ExecutionState {
    return {
      id: execution.executionId,
      startedAt: Date.now(),
      status: this.mode === 'strict' ? 'running' : 'queued',
    };
  }

  public expandScenario(scenario: LabScenario): readonly string[] {
    const paths = this.buildExecutionMap();
    return [...(paths.get(scenario.scenarioId) ?? []), ...scenario.labels];
  }
}
