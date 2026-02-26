import type {
  OrbiRoute,
  OrbiRouteCatalog,
  OrbiRouteProfile,
  OrbiResolvedPayload,
  OrbiRouteParts,
  OrbiNodeThirty,
} from '@shared/type-level/stress-orion-constellation';
import { orbiCatalogSource } from '@shared/type-level/stress-orion-constellation';
import type { OrbiNodeForty as FabricOrbiNodeForty } from '@shared/type-level/stress-orion-subtype-hierarchies';
import type { EventRoute } from '@shared/type-level/stress-orion-template-math';
import type { ConstraintInput } from '@shared/type-level/stress-orion-constraints';
import type { DecisionTree, RoutedEvent } from '@shared/type-level/stress-orion-controlflow';
import type {
  OrbiCommand,
  SolverInput,
  SolverMatrix,
  SolverResult,
} from '@shared/type-level/stress-orion-instantiator';

export type HubRouteEnvelope = OrbiRouteProfile<OrbiRoute>;
export type HubRouteCatalog<T extends readonly OrbiRoute[]> = OrbiRouteCatalog<T>;

export type HubResolver<T extends readonly OrbiRoute[]> = OrbiResolvedPayload<T>;

export type HubResolution<T extends OrbiRoute> = {
  readonly route: T;
  readonly parts: OrbiRouteParts<T>;
};

export type HubEventEnvelope<T extends string> = T extends ConstraintInput<infer _A, infer _B, infer _C>
  ? {
      readonly raw: T;
      readonly active: true;
    }
  : never;

export type HubTemplateUnion = EventRoute | OrbiRoute | OrbiCommand;

export interface HubNodeEnvelope {
  readonly orbit: OrbiNodeThirty;
  readonly stage: FabricOrbiNodeForty['stage'];
  readonly marker: 'hub';
}

export interface HubOrbitEnvelope {
  readonly orbit: OrbiNodeThirty;
  readonly stage: OrbiNodeThirty['stage'];
  readonly marker: 'hub';
}

export type HubDecision<TEvent extends RoutedEvent> = TEvent extends RoutedEvent
  ? DecisionTree<TEvent>
  : never;

export type HubSolver<T extends OrbiCommand, TPayload> = SolverResult<
  SolverInput<'incident', 'compose', string>['state'],
  'compose',
  TPayload
>;

export type HubSolverMatrix<T extends readonly OrbiCommand[]> = readonly SolverResult<string, string, unknown>[];
export type HubEnvelope<T extends OrbiCommand> = {
  readonly command: T;
  readonly solved: HubSolver<T, SolverInput<'incident', 'compose', string> & { readonly token: T }>;
};

export const hubTag = 'type-level-hub-orion';

export type HubCatalogByCommand<T extends readonly OrbiCommand[]> = {
  readonly commands: T;
  readonly payload: HubSolverMatrix<T>;
};

export const hubCatalog: HubCatalogByCommand<
  readonly [
    OrbiCommand,
    OrbiCommand,
    OrbiCommand,
  ]
> = {
  commands: [
    '/incident/compose/tag-001',
    '/incident/simulate/tag-002',
    '/incident/reconcile/tag-003',
  ],
  payload: [
    {
      state: 'incident',
      code: 'compose',
      payload: { tag: 'tag-001', createdAt: 10 },
      checksum: 'incident-compose',
    },
    {
      state: 'incident',
      code: 'simulate',
      payload: { tag: 'tag-002', createdAt: 11, simulation: true },
      checksum: 'incident-simulate',
    },
    {
      state: 'incident',
      code: 'reconcile',
      payload: { tag: 'tag-003', createdAt: 12, reconciled: true },
      checksum: 'incident-reconcile',
    },
  ] as HubSolverMatrix<
    readonly [
      OrbiCommand,
      OrbiCommand,
      OrbiCommand,
    ]
  >,
};

export const hubRouteTemplates = [
  orbiCatalogSource[0],
  orbiCatalogSource[1],
  orbiCatalogSource[2],
  orbiCatalogSource[3],
] as const satisfies readonly OrbiRoute[];

export const hubControlSample: HubResolution<typeof hubRouteTemplates[number]>[] = hubRouteTemplates.map((route) => ({
  route,
  parts: route.split('/') as unknown as OrbiRouteParts<typeof route>,
}));
