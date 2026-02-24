import {
  type ArcaneEventType,
  type ArcanePluginKind,
  type ArcaneWorkspaceAction,
  type ArcaneWorkspaceEvent,
  type ArcaneWorkspaceState,
  buildPluginEvent,
  buildWorkspaceEvent,
  arcaneWorkspaceStateDefaults,
  toWorkspaceStateAction,
  createPluginId,
  createSessionId,
  createTenantId,
  createWorkspaceId,
  createRunId,
  createRouteNamespace,
  createArcaneSessionId,
  type ArcaneWorkspaceAction as ArcaneWorkspaceActionAlias,
} from './types';

export interface ArcaneWorkspaceSnapshot {
  readonly tenantId: string;
  readonly workspace: ArcaneWorkspaceState;
  readonly running: boolean;
  readonly events: readonly ArcaneWorkspaceActionAlias[];
  readonly timeline: readonly string[];
}

export type ArcaneStateReducerAction =
  | { readonly type: 'init'; readonly tenantId: string }
  | { readonly type: 'replace'; readonly workspace: ArcaneWorkspaceState }
  | { readonly type: 'event'; readonly event: ArcaneWorkspaceEvent }
  | { readonly type: 'events'; readonly payload: readonly ArcaneWorkspaceAction[] }
  | { readonly type: 'select-kinds'; readonly kinds: readonly ArcanePluginKind[] };

export const arcaneStateFromTenant = (tenantId: string): ArcaneWorkspaceSnapshot => {
  const workspace = arcaneWorkspaceStateDefaults(createTenantId(tenantId));
  return {
    tenantId,
    workspace,
    running: false,
    events: [
      {
        id: `init-${tenantId}`,
        type: 'workspace/start',
        workspaceId: workspace.workspaceId,
        at: new Date().toISOString(),
        tenantId: workspace.tenantId,
        payload: {
          reason: 'bootstrap',
        },
      },
    ],
    timeline: ['workspace:start'],
  };
};

const withTimeline = (event: ArcaneWorkspaceActionAlias): readonly ArcaneWorkspaceActionAlias[] => [event];

export const formatTimeline = (events: readonly ArcaneWorkspaceActionAlias[]): readonly string[] => {
  return events.map((event) => `${event.at}:${event.type}:${event.workspaceId}`);
};

export const summarizeKinds = (workspace: ArcaneWorkspaceState): readonly ArcaneWorkspaceEvent[] => {
  return workspace.selectedPluginKinds.map((kind) =>
    buildPluginEvent(workspace.tenantId, 'plugin/selected', workspace.workspaceId, createPluginId(`${workspace.tenantId}-${kind}`), kind, {
      kind,
      selected: true,
    }),
  );
};

export const reduceWorkspaceActions = (
  state: ArcaneWorkspaceSnapshot,
  action: ArcaneStateReducerAction,
): ArcaneWorkspaceSnapshot => {
  switch (action.type) {
    case 'init': {
      return arcaneStateFromTenant(action.tenantId);
    }
    case 'replace': {
      return {
        ...state,
        workspace: action.workspace,
      };
    }
    case 'select-kinds': {
      return {
        ...state,
        workspace: {
          ...state.workspace,
          selectedPluginKinds: action.kinds,
        },
      };
    }
    case 'events': {
      return {
        ...state,
        events: [...state.events, ...action.payload],
        timeline: [...state.timeline, ...action.payload.map((entry) => entry.type)],
      };
    }
    case 'event': {
      const actionEvent = toWorkspaceStateAction(action.event);
      const timeline = [...state.timeline, actionEvent.type];
      const events = [...state.events, actionEvent];
      if (action.event.type === 'workspace/start') {
        return {
          ...state,
          running: true,
          workspace: {
            ...state.workspace,
            status: 'running',
            sessionId: createSessionId(`${state.workspace.sessionId}:restarted`),
          },
          timeline,
          events,
        };
      }

      if (action.event.type === 'workspace/stop') {
        return {
          ...state,
          running: false,
          workspace: {
            ...state.workspace,
            status: 'ready',
          },
          timeline,
          events,
        };
      }

      if (action.event.type === 'plugin/selected') {
        const selected = (action.event.payload as { kind?: ArcanePluginKind } | undefined)?.kind;
        return {
          ...state,
          workspace: {
            ...state.workspace,
            selectedPluginKinds: selected
              ? state.workspace.selectedPluginKinds.includes(selected)
                ? state.workspace.selectedPluginKinds
                : [...state.workspace.selectedPluginKinds, selected]
              : state.workspace.selectedPluginKinds,
          },
          timeline,
          events,
        };
      }

      return {
        ...state,
        timeline,
        events,
      };
    }
    default: {
      const exhaustive: never = action;
      return state;
    }
  }
};

export const buildTransitionLog = (kinds: readonly ArcaneEventType[]) => kinds.join('|');

export const toPluginKinds = <T>(value: readonly T[], fallback: readonly ArcanePluginKind[]): readonly ArcanePluginKind[] => {
  return value
    .map((item) => String(item))
    .filter((item): item is ArcanePluginKind =>
      item === 'predictive' ||
      item === 'decision' ||
      item === 'playbook' ||
      item === 'telemetry' ||
      item === 'policy' ||
      item === 'signal')
    .slice(0, 10);
};

export const pruneEvents = (events: readonly ArcaneWorkspaceActionAlias[], max = 100): readonly ArcaneWorkspaceActionAlias[] =>
  events.slice(Math.max(0, events.length - max));
