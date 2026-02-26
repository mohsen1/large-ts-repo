import type {
  HubResolver,
  HubResolution,
  HubCatalogByCommand,
  HubRouteEnvelope,
  HubDecision,
  HubSolver,
  HubNodeEnvelope,
} from '@shared/type-level-hub';
import type { OrbiCommand } from '@shared/type-level/stress-orion-instantiator';
import type { OrbiRoute, OrbiRouteParts, OrbiRouteProfile } from '@shared/type-level/stress-orion-constellation';
import type { ControlEventBase, RoutedEvent } from '@shared/type-level/stress-orion-controlflow';

export type OrionEntityId = `orion-${string}`;

export type OrionSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'maintenance';

export type OrionWorkspaceState =
  | 'idle'
  | 'warming'
  | 'discovering'
  | 'routing'
  | 'executing'
  | 'observing'
  | 'error'
  | 'complete';

export interface OrionRuntimeConfig {
  readonly workspace: OrionEntityId;
  readonly autoRefreshMs: number;
  readonly allowAutoReplay: boolean;
  readonly maxParallel: number;
  readonly maxDepth: number;
}

export interface OrionWorkItem {
  readonly route: OrbiRoute;
  readonly profile: OrbiRouteProfile<OrbiRoute>;
  readonly expectedState: OrionWorkspaceState;
  readonly startedAt: string;
  readonly severity: OrionSeverity;
}

export interface OrionRunMetrics {
  readonly executed: number;
  readonly succeeded: number;
  readonly failed: readonly string[];
  readonly lastTick: string;
  readonly latencyMs: number;
}

export type OrionSignalEnvelope =
  | {
      readonly kind: 'route';
      readonly route: OrbiRoute;
      readonly parts: OrbiRouteParts<OrbiRoute>;
      readonly payload: HubRouteEnvelope;
      readonly generated: HubResolution<OrbiRoute>;
    }
  | {
      readonly kind: 'decision';
      readonly decision: HubDecision<RoutedEvent>;
    }
  | {
      readonly kind: 'solver';
      readonly result: HubSolver<OrbiCommand, readonly unknown[]>;
    };

export interface OrionTimelineEvent {
  readonly id: OrionEntityId;
  readonly stage: OrionWorkspaceState;
  readonly emittedAt: string;
  readonly envelope: OrionSignalEnvelope;
}

export interface OrionLabState {
  readonly config: OrionRuntimeConfig;
  readonly routeResolver: HubResolver<readonly OrbiRoute[]>;
  readonly commandCatalog: HubCatalogByCommand<readonly OrbiCommand[]>;
  readonly commandNode: HubNodeEnvelope;
  readonly activeWorkItem: OrionWorkItem | null;
  readonly activeCommand: HubDecision<RoutedEvent> | null;
  readonly status: OrionWorkspaceState;
  readonly items: readonly OrionWorkItem[];
  readonly timeline: readonly OrionTimelineEvent[];
  readonly metrics: OrionRunMetrics;
}

export interface OrionLabActions {
  readonly run: (route: OrbiRoute) => Promise<OrionWorkItem>;
  readonly cancel: (route: OrbiRoute) => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly replay: (id: OrionEntityId) => Promise<void>;
  readonly clear: () => void;
}

export type OrionTemplateRecord<T extends readonly string[]> = {
  readonly entries: {
    [K in keyof T]: {
      readonly key: T[K];
      readonly route: `/${T[K]}`;
      readonly mapped: `route-${K & number}`;
    };
  };
  readonly total: T['length'];
};

export type OrionControlTrace = {
  readonly source: ControlEventBase['source'];
  readonly ts: ControlEventBase['ts'];
  readonly sourceName: string;
  readonly detail: string;
};

export type OrionStateTuple = readonly [OrionWorkspaceState, OrionWorkspaceState, OrionWorkspaceState];

export const defaultOrionRuntimeConfig = {
  workspace: 'orion-workspace-alpha',
  autoRefreshMs: 3000,
  allowAutoReplay: true,
  maxParallel: 4,
  maxDepth: 25,
} as const satisfies OrionRuntimeConfig;

export type OrionWorkspaceActionMap = {
  readonly warm: 'warming';
  readonly discover: 'discovering';
  readonly route: 'routing';
  readonly execute: 'executing';
  readonly inspect: 'observing';
  readonly done: 'complete';
  readonly fail: 'error';
};
