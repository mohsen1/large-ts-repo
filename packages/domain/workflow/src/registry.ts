import { WorkflowDef, WorkflowId } from './graph';

export interface Registry {
  add(def: WorkflowDef): Registry;
  get(id: WorkflowId): WorkflowDef | undefined;
  list(): WorkflowDef[];
  remove(id: WorkflowId): Registry;
}

export class InMemoryWorkflowRegistry implements Registry {
  private workflows = new Map<string, WorkflowDef>();

  add(def: WorkflowDef): Registry {
    this.workflows.set(def.id, def);
    return this;
  }

  get(id: WorkflowId): WorkflowDef | undefined {
    return this.workflows.get(id);
  }

  list(): WorkflowDef[] {
    return Array.from(this.workflows.values());
  }

  remove(id: WorkflowId): Registry {
    this.workflows.delete(id);
    return this;
  }
}
