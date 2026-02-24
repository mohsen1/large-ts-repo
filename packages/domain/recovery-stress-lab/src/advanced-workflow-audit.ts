import { WorkflowExecutionTrace } from './advanced-workflow-models';
import { type TenantId } from './models';
import { type WorkflowRunId } from './advanced-workflow-models';

export type WorkflowEventKind = 'trace' | 'info' | 'warning' | 'error' | 'recommendation';

export interface WorkflowExecutionEvent {
  readonly at: string;
  readonly kind: WorkflowEventKind;
  readonly source: string;
  readonly message: string;
}

export type WorkflowAuditTrail = ReadonlyMap<number, WorkflowExecutionEvent>;

export class WorkflowAuditScope {
  #events: WorkflowExecutionEvent[] = [];
  #isDisposed = false;
  #tenant: TenantId;
  #runId: WorkflowRunId;
  constructor(tenant: TenantId, runId: WorkflowRunId) {
    this.#tenant = tenant;
    this.#runId = runId;
  }

  record<TKind extends WorkflowEventKind>(kind: TKind, source: string, message: string): void {
    if (this.#isDisposed) return;
    this.#events.push({
      at: new Date().toISOString(),
      kind,
      source,
      message,
    });
  }

  timeline(): readonly WorkflowExecutionEvent[] {
    return [...this.#events];
  }

  summarize(): string {
    const grouped = this.#events.reduce<Record<WorkflowEventKind, number>>(
      (acc, event) => ({
        ...acc,
        [event.kind]: (acc[event.kind] ?? 0) + 1,
      }),
      {
        trace: 0,
        info: 0,
        warning: 0,
        error: 0,
        recommendation: 0,
      },
    );

    return `run=${this.#runId};tenant=${this.#tenant};${Object.entries(grouped)
      .map(([kind, count]) => `${kind}=${count}`)
      .join('|')}`;
  }

  toTrace(): readonly WorkflowExecutionTrace[] {
    return this.#events.map((event, index) => ({
      sequence: index,
      stage: index % 2 === 0 ? 'input' : 'report',
      pluginId: `${this.#runId}-${event.source}`,
      ok: event.kind !== 'error',
      message: `${event.kind}: ${event.message}`,
    }));
  }

  [Symbol.dispose](): void {
    this.#isDisposed = true;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#isDisposed = true;
    this.#events = [];
    return Promise.resolve();
  }
}

export const collectTrace = (events: Iterable<WorkflowExecutionEvent>): readonly WorkflowExecutionTrace[] => {
  const output: WorkflowExecutionTrace[] = [];
  let index = 0;
  for (const event of events) {
    output.push({
      sequence: index,
      stage: index % 2 === 0 ? 'shape' : 'simulate',
      pluginId: event.source,
      ok: event.kind !== 'error',
      message: `${event.kind}:${event.message}`,
    });
    index += 1;
  }
  return output;
};

export const buildAuditTrail = (events: readonly WorkflowExecutionEvent[]): WorkflowAuditTrail => {
  const entries = new Map<number, WorkflowExecutionEvent>();
  for (let index = 0; index < events.length; index += 1) {
    entries.set(index, events[index]);
  }
  return entries;
};

export const withWorkflowAudit = async <T>(
  runId: WorkflowRunId,
  tenant: TenantId,
  run: (scope: WorkflowAuditScope) => Promise<T>,
): Promise<T> => {
  await using stack = new AsyncDisposableStack();
  const scope = new WorkflowAuditScope(tenant, runId);
  stack.defer(() => scope[Symbol.dispose]());
  scope.record('info', 'audit', 'scope-open');
  const events = await run(scope);
  stack.defer(() => scope.record('info', 'audit', 'scope-close'));
  return events;
};
