import type {
  ReadinessPlaybookTemplate,
  ReadinessRun,
  ReadinessPlanWindow,
  ReadinessRunEnvelope,
  PlaybookDefinition,
} from '@domain/recovery-readiness/playbook-models';
import type { Result } from '@shared/result';
import { err, ok } from '@shared/result';

interface PersistedPlaybookRecord {
  playbook: ReadinessPlaybookTemplate;
  runEnvelope: ReadinessRunEnvelope;
  planWindow: ReadinessPlanWindow;
}

export interface PlaybookSearchFilters {
  playbookNameContains?: string;
  includeDraft?: boolean;
}

export interface PlaybookRepository {
  upsertPlaybook(record: PersistedPlaybookRecord): Promise<Result<void, Error>>;
  findPlaybook(playbookId: string): Promise<Result<ReadinessPlaybookTemplate | null, Error>>;
  findLatestRun(playbookId: string): Promise<Result<ReadinessRun | null, Error>>;
  queryPlaybooks(filters: PlaybookSearchFilters): Promise<Result<ReadinessPlaybookTemplate[], Error>>;
}

class InMemoryPlaybookRepository implements PlaybookRepository {
  private byId = new Map<string, PersistedPlaybookRecord>();

  async upsertPlaybook(record: PersistedPlaybookRecord): Promise<Result<void, Error>> {
    this.byId.set(record.playbook.id, record);
    return ok(undefined);
  }

  async findPlaybook(playbookId: string): Promise<Result<ReadinessPlaybookTemplate | null, Error>> {
    const record = this.byId.get(playbookId);
    if (!record) return ok(null);
    return ok(record.playbook);
  }

  async findLatestRun(playbookId: string): Promise<Result<ReadinessRun | null, Error>> {
    const record = this.byId.get(playbookId);
    if (!record) return ok(null);
    return ok(record.runEnvelope.run);
  }

  async queryPlaybooks(filters: PlaybookSearchFilters): Promise<Result<ReadinessPlaybookTemplate[], Error>> {
    const items = [...this.byId.values()].map((value) => value.playbook);
    const searchText = filters.playbookNameContains?.trim().toLowerCase() ?? null;
    const filtered = items.filter((item) => {
      if (!filters.includeDraft && item.playbook.category === 'compliance') {
        return false;
      }
      if (searchText && !item.playbook.name.toLowerCase().includes(searchText)) return false;
      return true;
    });
    return ok(filtered);
  }
}

const inMemoryStore = new InMemoryPlaybookRepository();

export const getPlaybookRepository = (): PlaybookRepository => inMemoryStore;

export const mapWindowFromTemplate = (template: ReadinessPlaybookTemplate): ReadinessPlanWindow => ({
  horizonHours: Math.max(1, template.playbook.steps.length),
  refreshCadenceMinutes: 15 + template.playbook.steps.length * 2,
  maxConcurrency: Math.min(12, 1 + template.playbook.steps.length),
  allowParallelRun: template.playbook.steps.length <= 8,
  blackoutWindows: [],
});

export const createEmptyPlaybookTemplate = (playbook: PlaybookDefinition): ReadinessPlaybookTemplate => ({
  id: `${playbook.id}-template`,
  title: `${playbook.name} Template`,
  definition: {
    horizonHours: Math.max(2, playbook.steps.length),
    refreshCadenceMinutes: 30,
    maxConcurrency: Math.max(1, playbook.steps.length),
    allowParallelRun: true,
    blackoutWindows: [],
  },
  playbook,
});

export const createMockPlaybookRun = (playbookId: string): ReadinessRun => ({
  id: `${playbookId}-run-${Math.random().toString(36).slice(2, 8)}`,
  playbookId,
  triggeredBy: 'orchestrator',
  status: 'draft',
  priority: 'normal',
  startedAt: new Date().toISOString(),
  riskScore: 0.45,
  signals: [],
  execution: [],
  metadata: {
    source: 'recovery-readiness-store',
  },
});

export const seedWithFixture = async (playbooks: PlaybookDefinition[]): Promise<Result<void, Error>> => {
  const repo = getPlaybookRepository();

  for (const playbook of playbooks) {
    const playbookTemplate = createEmptyPlaybookTemplate(playbook);
    const run = createMockPlaybookRun(playbook.id);
    const result = await repo.upsertPlaybook({
      playbook: playbookTemplate,
      runEnvelope: {
        run,
        template: playbookTemplate,
        context: {
          source: 'recovery-readiness-store',
          seeded: true,
          seededAt: new Date().toISOString(),
        },
      },
      planWindow: playbookTemplate.definition,
    });

    if (!result.ok) {
      return err(result.error, 'seed_failed');
    }
  }

  return ok(undefined);
};
