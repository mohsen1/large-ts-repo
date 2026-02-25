import type { CampaignBlueprint, CampaignId, CampaignRoute, NoInfer, TenantId, PhaseType } from './models';
import type { EventEnvelope } from '@shared/fault-intel-runtime';

export interface CampaignCatalogEntry<TBlueprint extends CampaignBlueprint<readonly PhaseType[]>> {
  readonly blueprint: TBlueprint;
  readonly tenantId: TenantId;
  readonly campaignId: CampaignId;
  readonly route: CampaignRoute<TBlueprint>;
  readonly createdAt: string;
}

export interface CatalogQuery {
  readonly tenantId?: TenantId;
  readonly routePrefix?: string;
}

type RouteTuple<T extends string> = readonly [T, ...T[]];

export interface CampaignRegistryOptions<TCampaign extends CampaignBlueprint<readonly PhaseType[]>> {
  readonly maxCatalogSize?: number;
  readonly tenantId?: TenantId;
  readonly defaultRoute?: CampaignRoute<TCampaign>;
}

export class CampaignRegistry<TBlueprint extends CampaignBlueprint<readonly PhaseType[]>> {
  private readonly entries = new Map<string, CampaignCatalogEntry<TBlueprint>>();
  private readonly history: RouteTuple<string>[] = [];

  constructor(private readonly options: CampaignRegistryOptions<TBlueprint> = {}) {}

  public upsert<TCandidate extends TBlueprint>(blueprint: NoInfer<TCandidate>): CampaignCatalogEntry<TCandidate> {
    const route = `tenant:${blueprint.tenantId}` as CampaignRoute<TCandidate>;
    const entry: CampaignCatalogEntry<TCandidate> = {
      blueprint,
      tenantId: blueprint.tenantId,
      campaignId: blueprint.campaignId,
      route,
      createdAt: new Date().toISOString(),
    };
    this.entries.set(blueprint.campaignId, entry);
    this.history.push([entry.campaignId]);
    this.pruneIfNeeded();
    return entry;
  }

  public get<TCandidate extends TBlueprint>(campaignId: CampaignId): CampaignCatalogEntry<TCandidate> | undefined {
    return this.entries.get(campaignId) as CampaignCatalogEntry<TCandidate> | undefined;
  }

  public delete(campaignId: CampaignId): boolean {
    return this.entries.delete(campaignId);
  }

  public list(query: CatalogQuery = {}): readonly CampaignCatalogEntry<TBlueprint>[] {
    const found = [...this.entries.values()].filter((entry) => {
      if (query.tenantId && entry.tenantId !== query.tenantId) {
        return false;
      }
      if (query.routePrefix && !String(entry.route).startsWith(query.routePrefix)) {
        return false;
      }
      return true;
    });
    return found.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  public listForRoute(
    route: CampaignRoute<TBlueprint>,
    envelope: EventEnvelope<string, string, unknown>,
  ): readonly CampaignCatalogEntry<TBlueprint>[] {
    const normalizedRoute = String(route);
    const normalizedSource = String(envelope.source);
    return this.list().filter((entry) => String(entry.route) === normalizedRoute || String(entry.route).includes(normalizedSource));
  }

  public size(): number {
    return this.entries.size;
  }

  private pruneIfNeeded(): void {
    const max = this.options.maxCatalogSize;
    if (!max) {
      return;
    }
    const removeCount = Math.max(0, this.entries.size - max);
    if (removeCount === 0) {
      return;
    }
    for (let index = 0; index < removeCount; index += 1) {
      const stale = this.history[index]?.at(0);
      if (stale) {
        this.entries.delete(stale);
      }
    }
  }
}
