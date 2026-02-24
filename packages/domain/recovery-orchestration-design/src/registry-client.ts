import { createHash } from 'node:crypto';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';
import { withBrand } from '@shared/core';
import type { NoInfer } from '@shared/type-level';
import type { DesignPlanId, DesignSignalKind, DesignStage, PlanSignal } from './contracts';

export type RegistryTransport = 'memory' | 'timer';
export type ClientMode = 'read-only' | 'read-write';
export type RegistryTopic<T extends DesignSignalKind = DesignSignalKind> = `design/registry/${T}`;

export interface RegistrySubscription<TSignal extends PlanSignal = PlanSignal> {
  readonly topic: RegistryTopic<TSignal['metric']>;
  readonly signal: TSignal;
}

export interface RegistryClientOptions {
  readonly endpoint?: string;
  readonly mode?: ClientMode;
  readonly flushMs?: number;
}

export interface RegistryState {
  readonly startedAt: number;
  readonly ticks: number;
  readonly published: number;
  readonly disconnected: boolean;
}

const defaultEndpoint = 'design://recovery-orchestration-design';

const signalId = (runId: DesignPlanId, metric: DesignSignalKind, stage: DesignStage, sequence: number): string =>
  withBrand(`${runId}-${metric}-${stage}-${sequence}-${createHash('sha1').update(String(runId)).digest('hex').slice(0, 8)}`, 'DesignSignalId');

export class DesignRegistryClient {
  #mode: ClientMode;
  #state: RegistryState;
  #endpoint: string;
  #flushMs: number;
  #closed = false;

  constructor(options: RegistryClientOptions = {}) {
    this.#endpoint = options.endpoint ?? defaultEndpoint;
    this.#mode = options.mode ?? 'read-only';
    this.#flushMs = Math.max(1, Math.floor(options.flushMs ?? 10));
    this.#state = {
      startedAt: Date.now(),
      ticks: 0,
      published: 0,
      disconnected: false,
    };
  }

  get state(): RegistryState {
    return this.#state;
  }

  get endpoint(): string {
    return this.#endpoint;
  }

  async publish<T extends PlanSignal>(signal: NoInfer<T>): Promise<void> {
    if (this.#closed) {
      throw new Error('registry-client-closed');
    }
    if (this.#mode !== 'read-write') {
      this.#state = { ...this.#state, disconnected: true };
      throw new Error('registry-readonly');
    }
    await setTimeoutPromise(this.#flushMs);
    this.#state = {
      ...this.#state,
      ticks: this.#state.ticks + 1,
      published: this.#state.published + 1,
    };
  }

  async *streamSignals<TSignal extends PlanSignal = PlanSignal>(
    planId: NoInfer<DesignPlanId>,
    signalKind: NoInfer<TSignal['metric']>,
  ): AsyncIterableIterator<RegistrySubscription<TSignal>> {
    const id = signalId(planId, signalKind as DesignSignalKind, 'intake', 0);
    const topic = `design/registry/${signalKind}` as RegistryTopic<TSignal['metric']>;
    const stages: DesignStage[] = ['intake', 'design', 'validate', 'execute', 'safety-check', 'review'];
    for (let index = 0; index < 4; index += 1) {
      if (this.#closed) {
        return;
      }
      await setTimeoutPromise(this.#flushMs);
      this.#state = {
        ...this.#state,
        ticks: this.#state.ticks + 1,
      };
      const stage = stages[index % stages.length];
      yield {
        topic,
        signal: {
          id,
          runId: planId,
          metric: signalKind as TSignal['metric'],
          stage,
          path: `signal/${signalKind}/${stage}`,
          value: index % 2 ? 0.5 : 0.2,
          timestamp: new Date().toISOString(),
        } as TSignal,
      };
    }
  }

  get diagnostics(): Readonly<RegistryState> {
    return this.#state;
  }

  async reconnect(): Promise<void> {
    if (!this.#closed) {
      this.#state = { ...this.#state, disconnected: false };
      return;
    }
    await setTimeoutPromise(this.#flushMs);
    this.#closed = false;
    this.#state = { ...this.#state, disconnected: false };
  }

  close(): void {
    this.#closed = true;
    this.#state = { ...this.#state, disconnected: true };
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.close();
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

export const createRegistryClient = (options?: RegistryClientOptions): DesignRegistryClient =>
  new DesignRegistryClient(options);
