import type { LabLane } from './models';
import { type NoInfer } from '@shared/type-level';

export interface Template<TName extends string, TKind extends LabLane> {
  readonly name: TName;
  readonly kind: TKind;
  readonly metadata: {
    readonly [K in `meta:${string}`]: string;
  };
}

export interface TemplateCatalog<TTemplates extends readonly Template<string, LabLane>[]> {
  readonly templates: TTemplates;
  readonly byKind: {
    readonly [K in LabLane]: readonly Template<string, K>[];
  };
}

const defaultTemplates = [
  { name: 'burst-network', kind: 'simulate', metadata: { 'meta:family': 'core' } },
  { name: 'auth-shield', kind: 'verify', metadata: { 'meta:family': 'security' } },
  { name: 'capacity-drain', kind: 'restore', metadata: { 'meta:family': 'stability' } },
] as const satisfies readonly Template<string, LabLane>[];

const byKind = (templates: readonly Template<string, LabLane>[]) => {
  const buckets = new Map<LabLane, Template<string, LabLane>[]>();
  for (const template of templates) {
    const existing = buckets.get(template.kind) ?? [];
    existing.push(template);
    buckets.set(template.kind, existing);
  }
  return buckets;
};

const pickByKind = <TKind extends LabLane>(
  templates: readonly Template<string, LabLane>[],
  kind: NoInfer<TKind>,
): readonly Template<string, TKind>[] => {
  return templates.filter(
    (template): template is Template<string, TKind> => template.kind === kind,
  );
};

export const createCatalog = (kind: LabLane): TemplateCatalog<readonly Template<string, LabLane>[]> => {
  const grouped = byKind(defaultTemplates);
  const selected = pickByKind(defaultTemplates, kind);
  const buckets = {
    simulate: pickByKind(grouped.get('simulate') ?? [], 'simulate'),
    ingest: pickByKind(grouped.get('ingest') ?? [], 'ingest'),
    verify: pickByKind(grouped.get('verify') ?? [], 'verify'),
    restore: pickByKind(grouped.get('restore') ?? [], 'restore'),
    report: pickByKind(grouped.get('report') ?? [], 'report'),
  } satisfies { readonly [K in LabLane]: readonly Template<string, K>[] };
  return {
    templates: selected,
    byKind: buckets,
  };
};
