import { createDisposableScope } from '@shared/recovery-lab-kernel';
import type {
  DesignPlanId,
  DesignPlanTemplate,
  DesignTenantId,
  DesignWorkspaceId,
  PlanSignal,
  DesignStage,
} from './contracts';
import {
  type DesignSessionId,
  asSessionId,
  asDesignPlanId,
  type DesignWorkspaceKey,
  normalizeTags,
  createWorkspaceKey,
  createDesignPluginId,
  toSignalRoute,
} from './design-advanced-types';

type Lane = 'ingest' | 'design' | 'verify' | 'release';

export interface WorkspaceRunbook {
  readonly tenant: DesignTenantId;
  readonly workspace: DesignWorkspaceId;
  readonly template: DesignPlanTemplate;
}

export interface WorkspaceWindow {
  readonly from: number;
  readonly to: number;
  readonly severity: number;
  readonly signalCount: number;
}

export interface WorkspaceStateContext {
  readonly key: DesignWorkspaceKey;
  readonly sessionId: DesignSessionId;
  readonly lane: Lane;
  readonly activePlanId: DesignPlanId;
}

export interface WorkspaceEvent {
  readonly id: string;
  readonly lane: Lane;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}

interface RuntimeBucket {
  readonly templateId: string;
  readonly pluginId: string;
  readonly signals: PlanSignal[];
  readonly events: WorkspaceEvent[];
}

export class WorkspaceState {
  #state: WorkspaceStateContext;
  readonly #lane: Lane;
  readonly #seed = Date.now();
  readonly #runbooks = new Map<string, WorkspaceRunbook>();
  readonly #buckets = new Map<string, RuntimeBucket>();
  readonly #events: WorkspaceEvent[] = [];

  constructor(
    tenant: DesignTenantId,
    workspace: DesignWorkspaceId,
    templates: readonly DesignPlanTemplate[],
    lane: Lane = 'design',
  ) {
    this.#lane = lane;
    this.#state = {
      key: createWorkspaceKey(tenant, workspace),
      sessionId: asSessionId(tenant, workspace),
      lane,
      activePlanId: asDesignPlanId(
        tenant,
        workspace,
        templates[0]?.scenarioId ?? `bootstrap-${Date.now()}`,
      ),
    };

    for (const template of templates) {
      this.#runbooks.set(template.templateId, {
        tenant,
        workspace,
        template,
      });
      this.#buckets.set(template.templateId, {
        templateId: template.templateId,
        pluginId: createDesignPluginId(template.templateId),
        signals: [],
        events: [],
      });
    }

    this.recordEvent({
      id: `bootstrap:${this.#seed}`,
      lane,
      payload: {
        seed: this.#seed,
        templateCount: templates.length,
      },
    });
  }

  get state(): WorkspaceStateContext {
    return this.#state;
  }

  listTemplates(): readonly WorkspaceRunbook[] {
    return [...this.#runbooks.values()];
  }

  windows(): readonly RuntimeBucket[] {
    return [...this.#buckets.values()];
  }

  events(): readonly WorkspaceEvent[] {
    return [...this.#events];
  }

  activeTemplate(): WorkspaceRunbook | undefined {
    const active = this.#state.activePlanId;
    for (const runbook of this.#runbooks.values()) {
      const candidate = `${runbook.tenant}:${runbook.workspace}:${runbook.template.scenarioId}` as string;
      if (candidate === active) {
        return runbook;
      }
    }
    const first = [...this.#runbooks.values()][0];
    return first;
  }

  rotatePlan(nextTemplateId: string): void {
    const next = this.#runbooks.get(nextTemplateId);
    if (!next) {
      return;
    }
    this.#state = {
      ...this.#state,
      activePlanId: asDesignPlanId(next.tenant, next.workspace, next.template.scenarioId),
    };
    this.recordEvent({
      id: `rotate:${nextTemplateId}`,
      lane: this.#lane,
      payload: {
        template: nextTemplateId,
      },
    });
  }

  ingest(signal: PlanSignal): WorkspaceWindow {
    const bucket = this.ensureBucket(signal.metric);
    bucket.signals.push(signal);
    bucket.events.push({
      id: signal.id,
      lane: this.#lane,
      payload: {
        metric: signal.metric,
        stage: signal.stage,
        value: signal.value,
      },
    });
    const values = bucket.signals.map((entry) => entry.value);
    const severity = values.length === 0 ? 0 : values.reduce((acc, value) => acc + value, 0) / values.length;
    return {
      from: Date.now() - values.length * 10,
      to: Date.now(),
      severity,
      signalCount: values.length,
    };
  }

  summarize(): {
    readonly totalSignals: number;
    readonly totalEvents: number;
    readonly routes: readonly string[];
  } {
    const buckets = [...this.#buckets.values()];
    const totalSignals = buckets.reduce((acc, bucket) => acc + bucket.signals.length, 0);
    const totalEvents = this.#events.length;
    const routes = normalizeTags(this.#events.map((entry) => entry.id))
      .map((entry) => toSignalRoute('health', 'intake').replace('signal/health', entry.replace('tag:', '')));
    return { totalSignals, totalEvents, routes };
  }

  async checkpoint(label: string): Promise<string> {
    await using _scope = createDisposableScope();
    this.recordEvent({
      id: `checkpoint:${label}`,
      lane: this.#lane,
      payload: {
        seed: this.#seed,
        runbooks: this.#runbooks.size,
      },
    });
    return `checkpoint://${label}`;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#buckets.clear();
    this.#events.length = 0;
    this.#runbooks.clear();
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.#buckets.clear();
    this.#events.length = 0;
    this.#runbooks.clear();
  }

  private ensureBucket(key: string): RuntimeBucket & { readonly signals: PlanSignal[]; readonly events: WorkspaceEvent[] } {
    const bucket = this.#buckets.get(key);
    if (bucket) {
      return bucket;
    }
    const fallback: RuntimeBucket = {
      templateId: key,
      pluginId: createDesignPluginId(key),
      signals: [],
      events: [],
    };
    this.#buckets.set(key, fallback);
    return fallback;
  }

  private recordEvent(entry: WorkspaceEvent): void {
    this.#events.push(entry);
  }
}

const laneOrder = ['ingest', 'design', 'verify', 'release'] as const satisfies readonly Lane[];

export const nextLane = (lane: Lane): Lane => laneOrder[(laneOrder.indexOf(lane) + 1) % laneOrder.length] ?? 'design';
export const isValidLane = (value: string): value is Lane => laneOrder.includes(value as Lane);

export const windowsFromSignals = (signals: readonly PlanSignal[], stage: DesignStage): readonly WorkspaceWindow[] => {
  const rows = signals
    .filter((entry) => entry.stage === stage)
    .toSorted((left, right) => left.timestamp.localeCompare(right.timestamp));

  const windows = new Map<number, PlanSignal[]>();
  for (const signal of rows) {
    const bucket = windows.get(signal.stage.length) ?? [];
    bucket.push(signal);
    windows.set(signal.stage.length, bucket);
  }

  return [...windows.entries()]
    .map(([key, values]) => {
      const total = values.reduce((acc, value) => acc + value.value, 0);
      const average = total / Math.max(1, values.length);
      return {
        from: Date.now() - key * 50,
        to: Date.now(),
        severity: average,
        signalCount: values.length,
      };
    })
    .toSorted((left, right) => right.from - left.from);
};
