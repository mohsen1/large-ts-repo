import { z } from 'zod';
import { NoInfer } from '@shared/type-level';
import {
  type RecoverySignal,
  type RecoverySignalId,
  type SeverityBand,
  type StageSignal,
  type StageSignalId,
  type TenantId,
  SignalClass,
  createSignalId,
  createTenantId,
} from './models';
import { parseRecoverySignals } from './signal-orchestration';

const routeSchema = z
  .object({
    tenantId: z.string().min(2),
    route: z.string().min(2),
    version: z.string().min(1),
  })
  .passthrough();

export type RouteTemplate = `${string}::${string}`;

export type SignalPath<T extends string> = T extends `${infer Left}/${infer Right}`
  ? Left | `${Left}/${Right}` | `${Left}.${SignalPath<Right>}`
  : T;

export type SignalNamespace<T extends string> = `signal:${T}`;

export type RecoverSeverity =
  | {
      readonly severity: 'critical';
      readonly multiplier: 4;
    }
  | {
      readonly severity: Exclude<SeverityBand, 'critical'>;
      readonly multiplier: 1;
    };

export type BrandedSignalId<TPrefix extends string, TId extends string> = TId & { readonly __brand: TPrefix };
export type RawSignalRoute<T extends string> = `${T}:${SignalClass}`;

export type SignalEnvelopeKey<TSignals extends readonly RecoverySignal[]> = {
  [K in TSignals[number]['id']]: {
    readonly signal: K;
    readonly score: number;
  };
};

export interface RawSignalEnvelope<
  TTenantId extends string,
  TSignals extends readonly unknown[] = readonly unknown[],
> {
  readonly tenantId: TTenantId;
  readonly signals: TSignals;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ParsedSignalEnvelope<TSignals extends readonly StageSignal[]> {
  readonly tenantId: TenantId;
  readonly signals: TSignals;
  readonly signature: string;
}

export interface SignalPulseEnvelope {
  readonly pulseId: BrandedSignalId<'pulse', string>;
  readonly tenantId: TenantId;
  readonly path: string;
  readonly signals: readonly RecoverySignal[];
  readonly grouped: Readonly<Record<string, readonly RecoverySignal[]>>;
  readonly ranked: readonly StageSignal[];
}

export interface OrchestrationSignalTemplate<TName extends string = string> {
  readonly name: TName;
  readonly tenantId: TenantId;
  readonly classes: readonly SignalClass[];
  readonly bands: readonly SeverityBand[];
}

export interface SignalPolicyRuntime {
  readonly tenantId: TenantId;
  readonly template: OrchestrationSignalTemplate;
  readonly signalCount: number;
  readonly routes: SignalRouteDigest[];
  readonly digest: string;
}

export interface SignalRouteDigest {
  readonly route: RouteTemplate;
  readonly severity: SeverityBand;
  readonly className: SignalClass;
  readonly count: number;
}

const rawSignalSchema = z
  .object({
    tenantId: z.string().min(2),
    signals: z.array(z.unknown()),
    metadata: z.record(z.unknown()),
  })
  .passthrough();

const rawSignalTupleSchema = rawSignalSchema.array();

const toNumber = (value: unknown): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : 1;
};

const normalizeId = (tenantId: TenantId, signal: RecoverySignal): StageSignalId => {
  return createSignalId(`${tenantId}:${signal.id}`);
};

export const isSeverityBand = (value: string): value is SeverityBand => {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
};

const extractWeightMultiplier = (raw: unknown): number => {
  if (raw === null || typeof raw !== 'object') {
    return 1;
  }
  const value = (raw as { weightMultiplier?: unknown }).weightMultiplier;
  return toNumber(value);
};

const toRouteTemplate = (tenantId: TenantId, route: string): RouteTemplate => `${tenantId}::${route}` as RouteTemplate;

export const buildSignalRoute = <
  TTenantId extends string,
  TSignals extends readonly RecoverySignal[],
>(
  tenantId: TTenantId,
  signals: TSignals,
): SignalEnvelopeKey<TSignals> => {
  const out = {} as SignalEnvelopeKey<TSignals>;
  for (const signal of signals) {
    if (!signal || typeof signal !== 'object' || !signal.id || !isSeverityBand(signal.severity)) continue;
    const multiplier = signal.severity === 'critical' ? 4 : 1;
    const weight = extractWeightMultiplier(signal.metadata);
    const score = multiplier * (1 + weight);
    (out as Record<string, unknown>)[String(signal.id)] = {
      signal: signal.id,
      score,
    };
  }
  return out;
};

export const normalizeSignalEnvelope = <TSignals extends readonly unknown[]>(
  value: unknown,
): RawSignalEnvelope<string, TSignals> | null => {
  const parsed = rawSignalSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  return {
    tenantId: parsed.data.tenantId,
    signals: parsed.data.signals as unknown as TSignals,
    metadata: parsed.data.metadata,
  };
};

export const normalizeSignalTuples = (raw: unknown): readonly unknown[] => {
  const tuple = rawSignalTupleSchema.safeParse(raw);
  return tuple.success ? tuple.data : [];
};

export const rankSignalSet = <TSignals extends readonly StageSignal[]>(signals: NoInfer<TSignals>): TSignals => {
  const ranked = [...signals].toSorted((left, right) => right.score - left.score);
  return ranked as unknown as TSignals;
};

export const buildSignalDigest = (tenantId: TenantId, signals: readonly StageSignal[]): string => {
  return `${tenantId}::${signals.length}::${signals.reduce((carry, signal) => carry + signal.score, 0).toFixed(3)}`;
};

export const createSignalTemplate = (
  tenantId: TenantId,
  options?: Partial<{
    readonly bands: readonly SeverityBand[];
    readonly classes: readonly SignalClass[];
    readonly name: string;
  }>,
): OrchestrationSignalTemplate => {
  const classes = options?.classes?.length
    ? (options.classes as readonly SignalClass[])
    : ['availability', 'performance', 'integrity', 'compliance'] as const;
  const bands = options?.bands?.length
    ? (options.bands as readonly SeverityBand[])
    : (['low', 'medium', 'high', 'critical'] as const);

  return {
    name: options?.name ?? 'default',
    tenantId,
    classes,
    bands,
  };
};

export const parseSignalEnvelope = (
  tenantId: TenantId,
  rawEnvelope: unknown,
): ParsedSignalEnvelope<readonly StageSignal[]> | null => {
  const raw = normalizeSignalEnvelope(rawEnvelope);
  if (!raw) {
    return null;
  }

  const parsed = parseRecoverySignals(tenantId, raw.signals as readonly unknown[]);
  if (parsed.raw.length === 0) {
    return {
      tenantId,
      signals: [],
      signature: `empty:${tenantId}:${raw.tenantId}`,
    };
  }

  const ranked = rankSignalSet(parsed.raw);
  return {
    tenantId: createTenantId(raw.tenantId),
    signals: ranked,
    signature: buildSignalDigest(createTenantId(raw.tenantId), ranked),
  };
};

export const buildSignalEnvelope = (
  tenantId: TenantId,
  rawSignals: readonly unknown[],
): SignalPulseEnvelope => {
  const digest = parseSignalEnvelope(tenantId, {
    tenantId,
    signals: rawSignals,
    metadata: { kind: 'recovery-stress-lab' },
  });

  if (!digest) {
    return {
      pulseId: `pulse:${tenantId}:empty` as BrandedSignalId<'pulse', string>,
      tenantId,
      path: `${tenantId}::pulse`,
      signals: [],
      grouped: {},
      ranked: [],
    };
  }

  const grouped = rawSignals.reduce<Record<string, RecoverySignal[]>>((acc, signal) => {
    const parsed = signal as RecoverySignal;
    const key = `${parsed.class}:${parsed.severity}` as string;
    const bucket = acc[key] ?? [];
    acc[key] = [
      ...bucket,
      {
        id: createSignalId(parsed.id),
        class: parsed.class,
        severity: parsed.severity,
        title: parsed.title,
        createdAt: new Date().toISOString(),
        metadata: parsed.metadata,
      },
    ];
    return acc;
  }, {});

  const routes = Object.entries(grouped).map(([route, entries]) => {
    const [signalClass, severity] = route.split(':') as [SignalClass, SeverityBand];
    const normalized = toRouteTemplate(tenantId, route);
    return {
      route: normalized,
      severity,
      className: signalClass,
      count: entries.length,
    };
  });

  const templateSignals: OrchestrationSignalTemplate = {
    name: 'default',
    tenantId,
    bands: ['low', 'medium', 'high', 'critical'],
    classes: ['availability', 'performance', 'integrity', 'compliance'],
  };

  const runtime: SignalPolicyRuntime = {
    tenantId,
    template: templateSignals,
    signalCount: rawSignals.length,
    routes,
    digest: digest.signature,
  };

  const metadata = rawSignals as unknown as Record<string, unknown>;
  const route = JSON.stringify(metadata).includes('recovery') ? `${tenantId}::recovery` : `${tenantId}::fallback`;
  const normalizedPath = routeSchema.parse({
    tenantId,
    route,
    version: runtime.digest,
  });

  return {
    pulseId: `pulse:${normalizedPath.tenantId}:${normalizedPath.version}` as BrandedSignalId<'pulse', string>,
    tenantId,
    path: normalizedPath.route,
    signals: Object.values(grouped).flat(),
    grouped,
    ranked: parsedSignalToStage(digest.signals),
  };
};

export const parsedSignalToStage = <TSignals extends readonly StageSignal[]>(
  signals: NoInfer<TSignals>,
): readonly StageSignal[] => {
  return signals.toSorted((left, right) => right.score - left.score).map((entry, index) => {
    const normalized = normalizeId(createTenantId(entry.tenantId), {
      id: entry.signal,
      class: entry.signalClass ?? 'availability',
      severity: entry.severity,
      title: entry.signal,
      createdAt: new Date(entry.createdAt).toISOString(),
      metadata: { index },
    });

    return {
      signal: normalized,
      tenantId: entry.tenantId,
      signalClass: entry.signalClass,
      severity: entry.severity,
      score: Number((entry.score + index * 0.01).toFixed(3)),
      createdAt: entry.createdAt,
      source: entry.source,
    };
  });
};

export const buildSignalPolicyRuntime = (
  tenantId: TenantId,
  signals: readonly StageSignal[],
  template: OrchestrationSignalTemplate,
): SignalPolicyRuntime => {
  const grouped = signals.reduce<Record<string, { count: number; route: string }>>((acc, signal) => {
    const key = `${signal.signalClass}/${signal.severity}`;
    const entry = acc[key] ?? { count: 0, route: key };
    acc[key] = {
      count: entry.count + 1,
      route: toRouteTemplate(tenantId, key),
    };
    return acc;
  }, {});

  const routes = Object.entries(grouped).map(([route, value]) => {
    const [signalClass, severity] = route.split('/') as [SignalClass, SeverityBand];
    return {
      route: toRouteTemplate(tenantId, route),
      severity,
      className: signalClass,
      count: value.count,
    };
  });

  const digest = `${tenantId}:${template.name}:${signals.length}:${routes.length}`;
  return {
    tenantId,
    template,
    signalCount: signals.length,
    routes,
    digest,
  };
};

export const createSignalEnvelopeFromRoutes = (
  tenantId: TenantId,
  routes: readonly SignalRouteDigest[],
): OrchestrationSignalTemplate => {
  const classes = [...new Set(routes.map((entry) => entry.className))] as SignalClass[];
  const bands = [...new Set(routes.map((entry) => entry.severity))] as SeverityBand[];
  return {
    name: `${tenantId}:route-template`,
    tenantId,
    classes,
    bands,
  };
};
