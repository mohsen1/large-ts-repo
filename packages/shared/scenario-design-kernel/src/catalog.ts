import { z } from 'zod';
import type { StageVerb, StageKindToken } from './types';

type RawStageCatalogEntry = Omit<StageCategory<StageVerb>, 'token'> & {
  token: string;
};

export interface StageCategory<TKind extends StageVerb = StageVerb> {
  readonly kind: TKind;
  readonly token: StageKindToken<TKind>;
  readonly cost: 'low' | 'medium' | 'high';
  readonly latencyP95Ms: number;
  readonly requirements: readonly string[];
}

const stageSchema = z.object({
  kind: z.enum(['ingress', 'enrichment', 'forecast', 'mitigation', 'verification', 'rollback', 'audit']),
  token: z.string(),
  cost: z.enum(['low', 'medium', 'high']),
  latencyP95Ms: z.number().nonnegative(),
  requirements: z.array(z.string()),
});

const rawCatalog: readonly RawStageCatalogEntry[] = [
  {
    kind: 'ingress',
    token: 'ingress:v1',
    cost: 'low',
    latencyP95Ms: 45,
    requirements: ['identity'],
  },
  {
    kind: 'enrichment',
    token: 'enrichment:v2',
    cost: 'high',
    latencyP95Ms: 120,
    requirements: ['telemetry', 'graph'],
  },
  {
    kind: 'forecast',
    token: 'forecast:v3',
    cost: 'medium',
    latencyP95Ms: 90,
    requirements: ['sla', 'signals'],
  },
  {
    kind: 'verification',
    token: 'verification:v1',
    cost: 'low',
    latencyP95Ms: 35,
    requirements: ['policy'],
  },
  {
    kind: 'mitigation',
    token: 'mitigation:v2',
    cost: 'high',
    latencyP95Ms: 150,
    requirements: ['action', 'permissions'],
  },
  {
    kind: 'verification',
    token: 'verification:v2',
    cost: 'medium',
    latencyP95Ms: 65,
    requirements: ['auditing'],
  },
  {
    kind: 'rollback',
    token: 'rollback:v1',
    cost: 'medium',
    latencyP95Ms: 80,
    requirements: ['snapshot'],
  },
  {
    kind: 'audit',
    token: 'audit:v1',
    cost: 'low',
    latencyP95Ms: 30,
    requirements: ['ledger'],
  },
];

const catalogSchema = z.array(stageSchema).readonly();

const parsedCatalog = catalogSchema.parse(rawCatalog).map((entry) => ({
  ...entry,
  token: entry.token as StageKindToken<StageVerb>,
}));

export const stageCatalog = parsedCatalog.reduce((acc, item) => {
  const key = item.kind;
  return {
    ...acc,
    [key]: item,
  };
}, {} as Record<StageVerb, (typeof parsedCatalog)[number]>);

const bootstrapPromise = Promise.resolve([...Object.values(stageCatalog)]);

export const bootstrapCatalog: Promise<readonly StageCategory<StageVerb>[]> = bootstrapPromise;

export function isKnownKind(kind: string): kind is StageVerb {
  return Object.prototype.hasOwnProperty.call(stageCatalog, kind);
}

export function describeKind(kind: StageVerb): StageCategory {
  return stageCatalog[kind];
}

export const orderedKinds = Object.values(stageCatalog)
  .map((entry) => entry.kind)
  .toSorted((a, b) => {
    const left = stageCatalog[a]?.latencyP95Ms ?? 0;
    const right = stageCatalog[b]?.latencyP95Ms ?? 0;
    return left - right;
  });

export const catalogRequirements = new Map<StageVerb, readonly string[]>(
  Object.entries(stageCatalog).map(([kind, item]) => [kind as StageVerb, item.requirements]),
);
