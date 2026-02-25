import { Brand } from '@shared/type-level';
import {
  type AutomationBlueprint,
  type AutomationTier,
  type PluginId,
  type RecoveryCockpitPluginDescriptor,
  type PluginRunResult,
} from '@domain/recovery-cockpit-orchestration-core';

export type BusKind =
  | 'automation.started'
  | 'automation.step.started'
  | 'automation.step.finished'
  | 'automation.step.failed'
  | 'automation.finished';

export type AutomationBusEvent<K extends BusKind = BusKind> = Readonly<{
  readonly kind: K;
  readonly tenant: Brand<string, 'Tenant'>;
  readonly traceId: Brand<string, 'TraceId'>;
  readonly createdAt: string;
  readonly payload: AutomationBusPayload<K>;
}>;

export type AutomationBusPayload<K extends BusKind> =
  K extends 'automation.started'
    ? { blueprintId: string; operator: string; stages: readonly AutomationTier[] }
    : K extends 'automation.step.started'
      ? { stepId: Brand<string, 'BlueprintStep'>; pluginId: PluginId; stage: AutomationTier }
      : K extends 'automation.step.finished'
        ? { stepId: Brand<string, 'BlueprintStep'>; result: PluginRunResult<unknown> }
        : K extends 'automation.step.failed'
          ? { stepId: Brand<string, 'BlueprintStep'>; errors: readonly string[] }
          : K extends 'automation.finished'
            ? { blueprintId: string; state: 'ok' | 'degraded'; elapsedMs: number }
            : never;

export type BusListener<K extends BusKind = BusKind> = (event: AutomationBusEvent<K>) => void;

export type EventBuckets = {
  [K in BusKind]: Set<BusListener<K>>;
};

export type BusDiagnostic = {
  readonly total: number;
  readonly byKind: Record<BusKind, number>;
  readonly byTenant: Readonly<Record<string, number>>;
  readonly blueprintId: string;
};

const buildBuckets = (): EventBuckets => ({
  'automation.started': new Set(),
  'automation.step.started': new Set(),
  'automation.step.finished': new Set(),
  'automation.step.failed': new Set(),
  'automation.finished': new Set(),
});

const iteratorFrom =
  (globalThis as {
    readonly Iterator?: {
      readonly from?: <T>(value: Iterable<T>) => { toArray(): T[] };
    };
  }).Iterator?.from;

const toArray = <T>(value: Iterable<T>): T[] => iteratorFrom?.(value)?.toArray() ?? [...value];

export class AutomationSignalBus {
  readonly #listeners = buildBuckets();
  readonly #history: AutomationBusEvent[] = [];

  subscribe<K extends BusKind>(kind: K, listener: BusListener<K>): () => void {
    const bucket = this.#listeners[kind];
    bucket.add(listener);
    return () => {
      bucket.delete(listener);
    };
  }

  publish<K extends BusKind>(event: AutomationBusEvent<K>): void {
    this.#history.push(event);
    for (const listener of this.#listeners[event.kind] as ReadonlySet<BusListener>) {
      (listener as BusListener)(event as AutomationBusEvent);
    }
  }

  history<K extends BusKind>(kind: K): readonly AutomationBusEvent<K>[] {
    return toArray(this.#history.filter((entry) => entry.kind === kind)) as unknown as readonly AutomationBusEvent<K>[];
  }

  snapshot(blueprint: AutomationBlueprint): BusDiagnostic {
    const byKind = {
      'automation.started': 0,
      'automation.step.started': 0,
      'automation.step.finished': 0,
      'automation.step.failed': 0,
      'automation.finished': 0,
    } as Record<BusKind, number>;

    const byTenant: Record<string, number> = {};
    for (const entry of this.#history) {
      byKind[entry.kind] += 1;
      byTenant[entry.tenant] = (byTenant[entry.tenant] ?? 0) + 1;
    }

    return {
      total: this.#history.length,
      byKind,
      byTenant,
      blueprintId: blueprint.header.blueprintId,
    };
  }
}

export const publishAutomationStarted = (
  bus: AutomationSignalBus,
  blueprint: AutomationBlueprint,
  tenant: Brand<string, 'Tenant'>,
  traceId: Brand<string, 'TraceId'>,
): void => {
  const stages = [...new Set(blueprint.steps.map((step) => step.plugin.stage))];
  bus.publish({
    kind: 'automation.started',
    tenant,
    traceId,
    createdAt: new Date().toISOString(),
    payload: {
      blueprintId: blueprint.header.blueprintId,
      operator: String(blueprint.header.createdBy),
      stages,
    },
  });
};

export const publishStepStarted = (
  bus: AutomationSignalBus,
  tenant: Brand<string, 'Tenant'>,
  traceId: Brand<string, 'TraceId'>,
  descriptor: RecoveryCockpitPluginDescriptor<PluginId, AutomationTier>,
  stepId: Brand<string, 'BlueprintStep'>,
): void => {
  bus.publish({
    kind: 'automation.step.started',
    tenant,
    traceId,
    createdAt: new Date().toISOString(),
    payload: {
      stepId,
      pluginId: descriptor.pluginId,
      stage: descriptor.stage,
    },
  });
};

export const publishStepFinished = (
  bus: AutomationSignalBus,
  tenant: Brand<string, 'Tenant'>,
  traceId: Brand<string, 'TraceId'>,
  result: PluginRunResult<unknown> & { stepId: Brand<string, 'BlueprintStep'> },
): void => {
  bus.publish({
    kind: 'automation.step.finished',
    tenant,
    traceId,
    createdAt: new Date().toISOString(),
    payload: {
      stepId: result.stepId,
      result,
    },
  });
};

export const publishStepFailed = (
  bus: AutomationSignalBus,
  tenant: Brand<string, 'Tenant'>,
  traceId: Brand<string, 'TraceId'>,
  stepId: Brand<string, 'BlueprintStep'>,
  errors: readonly string[],
): void => {
  bus.publish({
    kind: 'automation.step.failed',
    tenant,
    traceId,
    createdAt: new Date().toISOString(),
    payload: {
      stepId,
      errors,
    },
  });
};

export const publishAutomationFinished = (
  bus: AutomationSignalBus,
  tenant: Brand<string, 'Tenant'>,
  traceId: Brand<string, 'TraceId'>,
  blueprint: AutomationBlueprint,
  state: 'ok' | 'degraded',
  elapsedMs: number,
): void => {
  bus.publish({
    kind: 'automation.finished',
    tenant,
    traceId,
    createdAt: new Date().toISOString(),
    payload: {
      blueprintId: blueprint.header.blueprintId,
      state,
      elapsedMs,
    },
  });
};
