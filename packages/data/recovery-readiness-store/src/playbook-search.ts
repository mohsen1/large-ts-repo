import type { ReadinessPlaybookTemplate } from '@domain/recovery-readiness/playbook-models';
import { getPlaybookRepository, type PlaybookSearchFilters } from './playbook-repository';
import type { Result } from '@shared/result';

export interface PlaybookCatalogItem {
  id: string;
  name: string;
  category: ReadinessPlaybookTemplate['playbook']['category'];
  priority: ReadinessPlaybookTemplate['playbook']['priority'];
  revision: number;
  steps: number;
}

const toCatalogItem = (playbook: ReadinessPlaybookTemplate): PlaybookCatalogItem => ({
  id: playbook.playbook.id,
  name: playbook.playbook.name,
  category: playbook.playbook.category,
  priority: playbook.playbook.priority,
  revision: playbook.playbook.revision,
  steps: playbook.playbook.steps.length,
});

export const listCatalog = async (
  search: string,
  filters: Omit<PlaybookSearchFilters, 'playbookNameContains'> & { includeInactive?: boolean },
): Promise<Result<PlaybookCatalogItem[], Error>> => {
  const repo = getPlaybookRepository();
  const result = await repo.queryPlaybooks({
    playbookNameContains: search,
    includeDraft: filters.includeInactive,
  });

  if (!result.ok) {
    return result;
  }

  const catalog = result.value.map(toCatalogItem);
  return { ok: true, value: catalog, code: undefined };
};

export const rankCatalogByPriority = (catalog: PlaybookCatalogItem[]): PlaybookCatalogItem[] => {
  const ranked = [...catalog];
  const rank: Record<ReadinessPlaybookTemplate['playbook']['priority'], number> = {
    critical: 4,
    high: 3,
    normal: 2,
    low: 1,
  };
  ranked.sort((left, right) => {
    const diff = rank[right.priority] - rank[left.priority];
    if (diff !== 0) return diff;
    return right.revision - left.revision;
  });
  return ranked;
};

export const buildSearchSuggestions = (catalog: PlaybookCatalogItem[]): string[] => {
  const words = new Set<string>();
  catalog.forEach((item) => {
    item.name
      .split(/[^a-zA-Z]+/)
      .map((word) => word.toLowerCase())
      .filter(Boolean)
      .forEach((word) => {
        if (word.length > 2) words.add(word);
      });
  });
  return [...words].sort();
};
