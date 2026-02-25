import { ScenarioEventBridgeAdapter } from './eventbridge-adapter';
import type { ScenarioBridgeEvent } from './eventbridge-adapter';

interface LocalBridgeEvent extends ScenarioBridgeEvent {
  readonly local: true;
}

export class LocalEventBridgeAdapter {
  readonly #buffer: Array<LocalBridgeEvent> = [];
  readonly #bridge?: ScenarioEventBridgeAdapter;

  constructor(bridge?: ScenarioEventBridgeAdapter) {
    this.#bridge = bridge;
  }

  async emit(event: ScenarioBridgeEvent): Promise<void> {
    const local: LocalBridgeEvent = { ...event, local: true };
    this.#buffer.push(local);
    await Promise.resolve(this.#bridge?.emit(local));
  }

  drain(limit = 25): LocalBridgeEvent[] {
    const batch = this.#buffer.slice(0, limit);
    this.#buffer.splice(0, batch.length);
    return batch;
  }

  peek(limit = 25): readonly LocalBridgeEvent[] {
    return this.#buffer.slice(0, limit);
  }

  clear(): void {
    this.#buffer.length = 0;
  }

  size(): number {
    return this.#buffer.length;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.clear();
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.clear();
  }
}
