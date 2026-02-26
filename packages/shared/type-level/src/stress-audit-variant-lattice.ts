export type AuditDomain =
  | 'fleet'
  | 'fabric'
  | 'chronicle'
  | 'quantum'
  | 'mesh'
  | 'scenario'
  | 'drill'
  | 'policy'
  | 'signal'
  | 'risk'
  | 'continuity';

export type AuditAction =
  | 'create'
  | 'modify'
  | 'assign'
  | 'review'
  | 'escalate'
  | 'resolve'
  | 'archive'
  | 'snapshot'
  | 'verify'
  | 'replay'
  | 'seal'
  | 'unseal'
  | 'synthesize'
  | 'provision'
  | 'release'
  | 'notify'
  | 'quarantine'
  | 'observe'
  | 'dispatch';

export type AuditLevel = 'critical' | 'warning' | 'info' | 'debug';

export type AuditEventCode = `${AuditDomain}:${AuditAction}:${AuditLevel}`;

export interface AuditSeed {
  readonly source: string;
  readonly actor: string;
  readonly timestamp: string;
}

export interface AuditContext {
  readonly requestId: string;
  readonly traceId: string;
  readonly tenant: string;
}

export type AuditPayloadByAction<A extends AuditAction> =
  A extends 'create'
    ? { readonly resource: string; readonly owner: string }
    : A extends 'modify'
      ? { readonly diff: Record<string, unknown> }
      : A extends 'assign'
        ? { readonly assignee: string; readonly zone: string }
        : A extends 'review'
          ? { readonly reviewer: string; readonly score: number }
          : A extends 'escalate'
            ? { readonly reason: string; readonly target: string }
            : A extends 'resolve'
              ? { readonly evidence: string }
              : A extends 'archive'
                ? { readonly archiveId: string; readonly reason: string }
                : A extends 'snapshot'
                  ? { readonly snapshotRef: string }
                  : A extends 'verify'
                    ? { readonly verifier: string; readonly valid: boolean }
                    : A extends 'replay'
                      ? { readonly replayCursor: number }
                      : A extends 'seal'
                        ? { readonly sealReason: string }
                        : A extends 'unseal'
                          ? { readonly unsealReason: string }
                          : A extends 'synthesize'
                            ? { readonly inputs: readonly string[] }
                            : A extends 'provision'
                              ? { readonly capacity: number; readonly plan: string }
                              : A extends 'release'
                                ? { readonly releaseId: string; readonly target: string }
                                : A extends 'notify'
                                  ? { readonly channel: 'email' | 'slack' | 'pager'; readonly target: string }
                                  : A extends 'quarantine'
                                    ? { readonly scope: string; readonly expiresAt: string }
                                    : A extends 'observe'
                                      ? { readonly metric: string; readonly value: number }
                                      : A extends 'dispatch'
                                        ? { readonly route: string; readonly priority: 'p1' | 'p2' | 'p3' }
                                        : never;

export interface AuditEnvelopeBase {
  readonly action: AuditAction;
  readonly context: AuditContext;
  readonly seed: AuditSeed;
}

export type AuditEventByAction<A extends AuditAction> = AuditEnvelopeBase & {
  readonly action: A;
  readonly payload: AuditPayloadByAction<A>;
};

export type AuditEventByActionChain<A extends AuditAction, N extends number = 0> =
  N extends 10
    ? { readonly done: true; readonly action: A }
    : AuditEventByAction<A> & {
        readonly index: N;
        readonly next: AuditEventByActionChain<AuditAction, Inc<N>>;
      };

type Inc<N extends number> =
  N extends 0
    ? 1
    : N extends 1
      ? 2
      : N extends 2
        ? 3
        : N extends 3
          ? 4
          : N extends 4
            ? 5
            : N extends 5
              ? 6
              : N extends 6
                ? 7
                : N extends 7
                  ? 8
                  : N extends 8
                    ? 9
                    : N extends 9
                      ? 10
                      : 10;

export type AuditEnvelopeUnion<T extends readonly AuditAction[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends AuditAction
      ? Tail extends readonly AuditAction[]
        ? AuditEventByAction<Head> | AuditEnvelopeUnion<Tail>
        : never
      : never
    : never;

export type AuditEnvelopeMap<T extends AuditAction[]> = {
  [K in T[number]]: AuditEventByAction<K>;
};

export type AuditTemplateAction =
  | 'audit-start'
  | 'audit-pause'
  | 'audit-resume'
  | 'audit-stop'
  | 'audit-archive'
  | 'audit-restore'
  | 'audit-scan'
  | 'audit-sync'
  | 'audit-replay';

export type ParseAuditAction<T extends string> =
  T extends `audit-${infer A}-${infer B}`
    ? A extends AuditAction
      ? { readonly name: A; readonly scope: B }
      : never
    : never;

export type AuditRouteMap<T extends readonly AuditTemplateAction[]> = Record<
  AuditTemplateAction,
  {
    readonly route: T[number];
    readonly scope: string;
  }
>;

export type AuditChain<T extends AuditAction, I extends number = 0> =
  I extends 6
    ? {
        readonly terminal: true;
        readonly action: T;
      }
    : {
        readonly terminal: false;
        readonly action: T;
        readonly step: I;
        readonly next: AuditChain<T, Inc<I>>;
      };

export type AuditDepthUnion<T extends AuditAction> =
  AuditChain<T> | AuditChain<T, 1> | AuditChain<T, 2> | AuditChain<T, 3> | AuditChain<T, 4> | AuditChain<T, 5>;

export type ResolveRouteFromCode<T extends AuditEventCode> =
  T extends `${infer D}:${infer A}:${infer _}`
    ? D extends AuditDomain
      ? A extends AuditAction
        ? {
            readonly domain: D;
            readonly action: A;
            readonly canonical: `${D}:${A}`;
          }
        : never
      : never
    : never;

export type TemplateRoute = `/${AuditDomain}/${AuditAction}/${string}`;

export type TemplateFromAudit<T extends string> =
  T extends `/${infer D}/${infer A}/${infer I}`
    ? {
        readonly domain: D;
        readonly action: A;
        readonly input: I;
      }
    : never;

export type RouteEnvelopeFromTemplate<T extends TemplateRoute> =
  T extends `/${infer D}/${infer A}/${infer I}`
    ? { readonly key: `${D}/${A}`; readonly id: I; readonly valid: true }
    : { readonly key: 'invalid'; readonly id: 'invalid'; readonly valid: false };

export type TemplateDispatchMap<T extends TemplateRoute> = {
  [K in T]: {
    readonly route: K;
    readonly payload: RouteEnvelopeFromTemplate<K>;
  };
};

export type BranchDiscriminator<T extends AuditAction> =
  T extends 'create' | 'resolve'
    ? 'open'
    : T extends 'archive' | 'seal' | 'unseal'
      ? 'closed'
      : T extends 'escalate' | 'verify'
        ? 'guarded'
        : 'normal';

export type AuditBranchState = {
  readonly surface: AuditDomain;
  readonly action: AuditAction;
  readonly index: number;
  readonly kind: BranchDiscriminator<AuditAction>;
};

export type AuditBranchList<T extends readonly AuditAction[], I extends unknown[] = []> =
  I['length'] extends T['length']
    ? readonly AuditBranchState[]
    : T extends readonly [infer Head, ...infer Tail]
      ? Head extends AuditAction
        ? Tail extends readonly AuditAction[]
          ? readonly [
              { readonly surface: 'fleet'; readonly action: Head; readonly index: I['length']; readonly kind: BranchDiscriminator<Head> },
              ...AuditBranchList<Tail, [...I, Head]>
            ]
          : readonly []
        : readonly []
      : readonly [];

export type AuditBranchStateMap<T extends readonly AuditAction[]> = {
  readonly [K in keyof T]: AuditBranchState;
};

export type AuditGraph<T extends readonly AuditAction[]> = {
  readonly events: AuditEnvelopeUnion<T>;
  readonly chain: AuditBranchList<T>;
  readonly map: AuditBranchStateMap<T>;
};

export type TemplateRouteCatalog<T extends readonly TemplateRoute[]> = {
  readonly [K in keyof T as K extends number
    ? TemplateFromAudit<T[K] & string>['action'] extends AuditAction
      ? `${T[K] & string}_catalog`
      : never
    : never]: TemplateDispatchMap<T[K] & TemplateRoute>[T[K] & TemplateRoute];
};

export type Tupleify<T extends number, Acc extends unknown[] = []> =
  Acc['length'] extends T ? Acc : Tupleify<T, [...Acc, Acc['length']]>;

export type AuditLookup<T extends string, K extends readonly AuditAction[]> =
  T extends `${infer _}:${infer A}:${infer _}`
    ? A extends K[number]
      ? A
      : never
    : never;

export type RecAuditFold<T extends readonly AuditAction[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends AuditAction
      ? Tail extends readonly AuditAction[]
        ? {
            readonly head: Head;
            readonly tail: RecAuditFold<Tail>;
            readonly route: `${Head}-${Tail['length']}`;
          }
        : never
      : never
    : { readonly complete: true };

export type TemplateRemap<T> = {
  readonly [K in keyof T as K extends `__${string}` ? never : `audit_${K & string}`]: T[K];
};

export type AuditAuditMap<T extends RouteTemplate = TemplateRoute> = TemplateRemap<{ [K in AuditAction]: { readonly action: K } }>;

type RouteTemplate = TemplateRoute;

export const auditTemplates = [
  '/fleet/create/init',
  '/fabric/modify/config',
  '/chronicle/review/pending',
  '/risk/escalate/incident',
  '/policy/resolve/report',
  '/signal/snapshot/full',
  '/quantum/replay/trace',
  '/drill/release/smoke',
  '/scenario/dispatch/rehearsal',
  '/continuity/observe/event',
] as const satisfies readonly TemplateRoute[];

export const auditRouteMap = <T extends readonly AuditTemplateAction[]>(templates: [...T]): AuditRouteMap<T> => {
  const map = {} as Record<string, { readonly route: T[number]; readonly scope: string }>;
  for (const template of templates) {
    const parsed = parseAuditTemplate(template);
    map[parsed.name as string] = {
      route: template,
      scope: parsed.scope,
    };
  }
  return map as unknown as AuditRouteMap<T>;
};

export const parseAuditTemplate = (template: string) => {
  if (template.includes('-')) {
    const [, action, scope] = template.split('-');
    return {
      name: action as AuditAction,
      scope: scope as string,
    } as ParseAuditAction<string>;
  }
  if (template.includes('/')) {
    const [, action, scope] = template.split('/');
    return {
      name: action as AuditAction,
      scope: scope as string,
    } as { readonly name: AuditAction; readonly scope: string };
  }
  const [, action, scope] = template.split('-');
  return {
    name: action as AuditAction,
    scope: scope as string,
  } as { readonly name: AuditAction; readonly scope: string };
};

export const auditGraph = (actions: readonly AuditAction[]): AuditGraph<typeof auditActionSet> => {
  const chain = auditActionSet.map((action, index) => ({
    surface: index % 2 === 0 ? 'fleet' : 'fabric',
    action,
    index,
    kind: action === 'archive' ? 'closed' : action === 'escalate' ? 'guarded' : 'normal',
  } as const)) as unknown as AuditBranchList<typeof auditActionSet>;

  return {
    events: undefined as never,
    chain,
    map: chain as unknown as AuditBranchStateMap<typeof auditActionSet>,
  };
};

export const auditRouteCatalog = <T extends readonly TemplateRoute[]>(templates: [...T]): TemplateDispatchMap<T[number]> => {
  const output = {} as TemplateDispatchMap<T[number]>;

  for (const template of templates) {
    const parsed = template.split('/');
    const payload = {
      key: `${parsed[1]}/${parsed[2]}` as `${string}/${string}`,
      id: parsed[3] ?? 'default',
      valid: true,
    } as RouteEnvelopeFromTemplate<T[number]>;
    output[`${parsed[1]}_${parsed[2]}` as unknown as T[number]] = {
      route: template,
      payload,
    };
  }
  return output as TemplateDispatchMap<T[number]>;
};

export const isAuditCode = (input: string): input is AuditEventCode => {
  return /^([a-z]+):([a-z]+):([a-z]+)$/.test(input);
};

export const makeAuditRoute = <T extends AuditDomain, A extends AuditAction>(domain: T, action: A): `/${T}/${A}` => {
  return `/${domain}/${action}`;
};

export const parseAuditRoute = <T extends string>(value: T) => {
  const match = /^\/(\w+)\/(\w+)$/.exec(value);
  if (!match) {
    return {
      domain: 'fleet' as AuditDomain,
      action: 'create' as AuditAction,
      invalid: true,
    };
  }
  return {
    domain: match[1] as AuditDomain,
    action: match[2] as AuditAction,
    invalid: false,
  };
};

export const auditNoInfer = <T>(value: T & {}) => value;

export const auditMutual = (actions: readonly AuditAction[]): { readonly actions: AuditAction[]; readonly count: number } => {
  return {
    actions: [...actions],
    count: actions.length,
  };
};

export const auditActionSet = [
  'create',
  'modify',
  'assign',
  'review',
  'escalate',
  'resolve',
  'archive',
  'snapshot',
  'verify',
  'replay',
  'seal',
  'unseal',
  'synthesize',
  'provision',
  'release',
  'notify',
  'quarantine',
  'observe',
  'dispatch',
] as const;

export const auditPlan = [
  'fleet:create:critical',
  'fabric:modify:warning',
  'chronicle:review:info',
  'quantum:escalate:critical',
  'risk:resolve:info',
  'policy:snapshot:debug',
] as const satisfies AuditEventCode[];
