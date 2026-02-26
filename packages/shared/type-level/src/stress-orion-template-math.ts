export type EventRoute = `/${string}`;

export const eventRouteCatalog = [
  '/wave-center-open/id-1/critical',
  '/drift-deep-merge/id-2/error',
  '/pulse-east-route/id-3/warning',
  '/flare-south-route/id-4/notice',
  '/echo-west-close/id-5/info',
  '/quake-shore-seal/id-6/info',
  '/resonate-plateau-route/id-7/info',
  '/swell-plate-verify/id-8/error',
  '/spiral-valley-reboot/id-9/warning',
  '/burst-crown-scale/id-10/critical',
  '/pulse-center-signal/id-11/notice',
  '/drift-east-shift/id-12/info',
] as const;
export type EventCatalog = typeof eventRouteCatalog;

export type BuildTuple<N extends number, A extends readonly unknown[] = []> =
  A['length'] extends N ? A : BuildTuple<N, [...A, A['length']]>;
export type BuildRouteUnion<T extends string, Prefix extends string = '/orion'> = `${Prefix}:${T}`;
export type EventSpan = 'tick' | 'burst' | 'wave' | 'swell' | 'drift' | 'quake' | 'pulse' | 'flare' | 'echo' | 'resonate' | 'spiral';
export type EventSector = 'north' | 'south' | 'east' | 'west' | 'center' | 'plateau';
export type EventAction = 'open' | 'close' | 'shift' | 'fold' | 'align' | 'merge' | 'split' | 'snoop' | 'route' | 'signal' | 'drain';
export type EventStatus = 'info' | 'notice' | 'warning' | 'error' | 'critical';

export type EventShape<T extends EventRoute> = T extends `/${infer Span}-${infer Sector}-${infer Action}/${string}/${infer Status}`
  ? {
      readonly span: Span extends EventSpan ? Span : string;
      readonly sector: Sector extends EventSector ? Sector : string;
      readonly action: Action extends EventAction ? Action : string;
      readonly status: Status extends EventStatus ? Status : string;
      readonly id: T extends `${string}/${infer Id}/${string}` ? Id : string;
    }
  : { readonly span: string; readonly sector: string; readonly action: string; readonly status: string; readonly id: string };
export type EventProfile = {
  readonly tuple: readonly EventShape<EventCatalog[number]>[];
  readonly lookup: { readonly [key: string]: EventShape<EventCatalog[number]> };
  readonly union: BuildRouteUnion<EventCatalog[number], '/orion'>;
  readonly cardinality: number;
};

export const buildEventEnvelope = <T extends EventRoute>(route: T): EventShape<T> => {
  const [, token = '', id = 'id-0'] = route.split('/');
  const [span = '', sector = '', action = 'open', status = 'info'] = token.split('-');
  return {
    span,
    sector,
    action,
    status,
    id: `${id}`.split('/')[0] ?? 'id-0',
  } as EventShape<T>;
};
export const eventProfiles = eventRouteCatalog.map((route) => buildEventEnvelope(route));
export const routeTuple = eventRouteCatalog;
export const routeUnionBuilder = (): BuildRouteUnion<EventCatalog[number], '/orion'> => (
  '/orion:/wave-center-open/id-1/critical'
);
export const eventProfile: EventProfile = {
  tuple: eventProfiles,
  lookup: eventRouteCatalog.reduce((acc, route, index) => ({
    ...acc,
    [route]: eventProfiles[index]!,
  }), {} as EventProfile['lookup']),
  union: routeUnionBuilder(),
  cardinality: 12,
} as EventProfile;
