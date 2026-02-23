import { type HubExecution } from '@domain/recovery-command-control-hub';

export interface RuntimePublisher {
  publish(topic: string, payload: string): Promise<void>;
}

export interface CommandHubRepository {
  saveExecution(execution: HubExecution): Promise<void>;
  getRecent(tenantId: string): Promise<readonly HubExecution[]>;
}

export class InMemoryCommandHubRepository implements CommandHubRepository {
  private readonly store = new Map<string, HubExecution[]>();

  async saveExecution(execution: HubExecution): Promise<void> {
    const tenantRuns = this.store.get(execution.run.tenantId) ?? [];
    this.store.set(execution.run.tenantId, [...tenantRuns, execution]);
  }

  async getRecent(tenantId: string): Promise<readonly HubExecution[]> {
    return this.store.get(tenantId) ?? [];
  }
}

export class ConsoleRuntimePublisher implements RuntimePublisher {
  async publish(topic: string, payload: string): Promise<void> {
    void topic;
    void payload;
  }
}

export const publishExecution = async (
  publisher: RuntimePublisher,
  topic: string,
  execution: HubExecution,
): Promise<void> => {
  await publisher.publish(topic, JSON.stringify(execution));
};
