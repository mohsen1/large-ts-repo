import { type Brand, type DeepReadonly, type NoInfer, type RecursivePath } from './patterns';

export interface BridgeAnchor {
  readonly anchorId: Brand<string, 'anchor-id'>;
  readonly anchorLabel: `anchor:${string}`;
}

export interface BridgeSpan {
  readonly spanId: Brand<string, 'span-id'>;
  readonly spanLatencyMs: number;
  readonly spanStatus: 'idle' | 'active' | 'frozen';
}

export interface BridgeRoute {
  readonly routeId: Brand<string, 'bridge-route-id'>;
  readonly routePath: `/${string}`;
  readonly routePhase: 'open' | 'close' | 'refresh';
}

export interface BridgeTelemetry {
  readonly telemetryId: Brand<string, 'telemetry-id'>;
  readonly telemetryPath: `/${string}`;
  readonly telemetryScore: number;
}

export interface BridgeDirective {
  readonly directiveId: Brand<string, 'directive-id'>;
  readonly directiveSeverity: 1 | 2 | 3 | 4;
  readonly directiveNotes: readonly string[];
}

export interface BridgeEnvelopeRecord
  extends BridgeAnchor,
    BridgeSpan,
    BridgeRoute,
    BridgeTelemetry,
    BridgeDirective {}

export type BrandedEnvelope<T extends string> = T & { readonly __brand: 'bridge-envelope' };
export type SafeIntersection<T, U, V extends object = {}> = T & U & V;

export type BrandedEnvelopeInput = {
  readonly anchor: BridgeAnchor;
  readonly span: BridgeSpan;
  readonly route: BridgeRoute;
  readonly telemetry: BridgeTelemetry;
  readonly directive: BridgeDirective;
};

export type BridgeShapeByKind<T extends keyof BrandedEnvelopeInput> =
  T extends 'anchor' ? { readonly anchor: BrandedEnvelopeInput['anchor'] }
  : T extends 'span' ? { readonly span: BrandedEnvelopeInput['span'] }
  : T extends 'route' ? { readonly route: BrandedEnvelopeInput['route'] }
  : T extends 'telemetry' ? { readonly telemetry: BrandedEnvelopeInput['telemetry'] }
  : { readonly directive: BrandedEnvelopeInput['directive'] };

export type BridgeBundle<T extends readonly (keyof BrandedEnvelopeInput)[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends keyof BrandedEnvelopeInput
    ? Tail extends readonly (keyof BrandedEnvelopeInput)[]
      ? SafeIntersection<BridgeShapeByKind<Head>, BridgeBundle<Tail>, { readonly order: Readonly<T> }>
      : never
    : never
  : { readonly order: readonly [] };

export type BridgeEnvelope<T extends readonly (keyof BrandedEnvelopeInput)[]> = BridgeBundle<NoInfer<T>>;

export const defaultBridgePath = '/bridge/default' as const;
export const bridgeSeed = {
  anchor: {
    anchorId: 'anchor-seed' as Brand<string, 'anchor-id'>,
    anchorLabel: 'anchor:seed',
  },
  span: {
    spanId: 'span-seed' as Brand<string, 'span-id'>,
    spanLatencyMs: 3,
    spanStatus: 'idle',
  },
  route: {
    routeId: 'bridge-route-seed' as Brand<string, 'bridge-route-id'>,
    routePath: '/bridge/seed' as const,
    routePhase: 'open',
  },
  telemetry: {
    telemetryId: 'telemetry-seed' as Brand<string, 'telemetry-id'>,
    telemetryPath: '/telemetry/seed' as const,
    telemetryScore: 1,
  },
  directive: {
    directiveId: 'directive-seed' as Brand<string, 'directive-id'>,
    directiveSeverity: 2,
    directiveNotes: ['seed', 'baseline'],
  },
} as const satisfies BrandedEnvelopeInput;

export const bridgeKinds = ['anchor', 'span', 'route', 'telemetry', 'directive'] as const satisfies readonly (keyof BrandedEnvelopeInput)[];

type NestedMap<T> = {
  readonly [K in keyof T]: {
    readonly key: K;
    readonly readonlyValue: DeepReadonly<T[K]>;
  };
};

type BridgeMapRecord<T extends keyof BrandedEnvelopeInput> = {
  readonly key: T;
  readonly metadata: NestedMap<BrandedEnvelopeInput>[T];
};

const recursivePath = (path: string): boolean => {
  return path === '' || path.split('.').every((segment) => segment.length > 0);
};

const routePhase = (index: number): BrandedEnvelopeInput['route']['routePhase'] => {
  return index > 3 ? 'close' : 'open';
};

export const buildBridge = <T extends readonly (keyof BrandedEnvelopeInput)[]>(
  kinds: T,
): BridgeEnvelope<T> => {
  let envelope = {
    ...bridgeSeed,
    order: kinds,
  } as unknown as BridgeEnvelope<T>;

  for (const [index, kind] of kinds.entries()) {
    const suffix = `${defaultBridgePath}:${kind}:${index}`;
    if (kind === 'anchor') {
      envelope = { ...envelope, anchorId: `${suffix}:anchor`, anchorLabel: 'anchor:runtime' } as BridgeEnvelope<T>;
    } else if (kind === 'span') {
      envelope = {
        ...envelope,
        spanId: `${suffix}:span`,
        spanLatencyMs: index,
        spanStatus: index % 2 === 0 ? 'active' : 'idle',
      } as BridgeEnvelope<T>;
    } else if (kind === 'route') {
      envelope = {
        ...envelope,
        routeId: `${suffix}:route`,
        routePath: '/bridge/run',
        routePhase: 'refresh',
      } as BridgeEnvelope<T>;
    } else if (kind === 'telemetry') {
      envelope = {
        ...envelope,
        telemetryId: `${suffix}:telemetry`,
        telemetryPath: '/telemetry/run',
        telemetryScore: 10 + index,
      } as BridgeEnvelope<T>;
    } else {
      envelope = {
        ...envelope,
        directiveId: `${suffix}:directive`,
        directiveSeverity: 3,
        directiveNotes: ['runtime', routePhase(index)],
      } as BridgeEnvelope<T>;
    }
  }

  void recursivePath('anchor.anchorId');
  return envelope;
};

export const mapBridgeKinds = <T extends readonly (keyof BrandedEnvelopeInput)[]>(
  kinds: T,
): ReadonlyArray<BridgeMapRecord<T[number]>> =>
  kinds.map((kind) => ({
    key: kind,
    metadata: {
      key: kind,
      readonlyValue: bridgeSeed[kind],
    } as unknown as BridgeMapRecord<T[number]>['metadata'],
  }));

export const resolveBridgeBundle = (
  kinds: readonly (keyof BrandedEnvelopeInput)[],
): BrandedEnvelopeInput[keyof BrandedEnvelopeInput] => {
  const all = {
    anchor: bridgeSeed.anchor,
    span: bridgeSeed.span,
    route: bridgeSeed.route,
    telemetry: bridgeSeed.telemetry,
    directive: bridgeSeed.directive,
  } as const;

  const selected = kinds.at(-1);
  if (!selected) {
    return all.anchor;
  }

  return all[selected] as BrandedEnvelopeInput[keyof BrandedEnvelopeInput];
};
