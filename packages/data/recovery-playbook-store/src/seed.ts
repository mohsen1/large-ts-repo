import { withBrand } from '@shared/core';
import { RecoveryPlaybookSchema, type RecoveryPlaybook, type RecoveryPlaybookContext, type RecoveryPlaybookId, type RecoveryPlaybookQuery } from '@domain/recovery-playbooks';
import { InMemoryRecoveryPlaybookRepository } from './memory-repository';
import type { RecoveryPlaybookRepository } from './repository';

interface SeedOptions {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly locale: string;
  readonly count: number;
}

export interface SeededPlaybook {
  readonly id: RecoveryPlaybookId;
  readonly title: string;
  readonly tenant: string;
}

interface SeedRun {
  readonly runId: string;
  readonly status: 'ok' | 'fail' | 'skip';
  readonly reason?: string;
}

const nowIso = (): string => new Date().toISOString();

const buildPlaybookId = (tenantId: string, index: number): RecoveryPlaybookId =>
  withBrand(`playbook-${tenantId}-${index}`, 'RecoveryPlaybookId');

const stepScope = (index: number): RecoveryPlaybook['steps'][number]['scope'] => {
  if (index % 5 === 0) return 'tenant';
  if (index % 3 === 0) return 'service';
  if (index % 2 === 0) return 'region';
  return 'global';
};

const makeStep = (index: number): RecoveryPlaybook['steps'][number] => ({
  id: withBrand(`step-${index}`, 'RecoveryStepId'),
  name: `Seeded step ${index}`,
  summary: `Automated recovery step #${index}`,
  type: index % 3 === 0 ? 'manual' : 'automated',
  rank: index,
  owner: `seed-operator-${index % 4}`,
  action: { type: 'seed', step: index },
  scope: stepScope(index),
  durationMinutes: 8 + (index % 7) * 2,
  retries: index % 3,
  timeoutMinutes: 45 + index,
  constraints: [
    {
      key: 'riskScore',
      value: Math.min(10, index + 1),
      operator: 'gte',
    },
  ],
  dependencies: index > 0 ? [{ dependsOn: withBrand(`step-${index - 1}`, 'RecoveryStepId'), condition: 'after', optional: false }] : [],
  metadata: {
    index,
    generatedBy: 'seed-service',
  },
});

const buildRiskBand = (index: number): 'critical' | 'high' | 'medium' | 'low' => {
  if (index >= 18) return 'critical';
  if (index >= 12) return 'high';
  if (index >= 6) return 'medium';
  return 'low';
};

const buildSeededPlaybook = (tenantId: string, tenantName: string, index: number): RecoveryPlaybook => {
  const id = buildPlaybookId(tenantId, index);
  const envelope = {
    id,
    title: `Synthetic Playbook ${tenantName} ${index}`,
    status: index % 4 === 0 ? 'deprecated' : 'published',
    category: index % 2 === 0 ? 'recovery' : 'continuity',
    labels: ['automated', tenantId, `${buildRiskBand(index)}-risk`],
    version: `v${1 + index}`,
    owner: `team-${tenantId}`,
    steps: Array.from({ length: 4 + (index % 10) }, (_, stepIndex) => makeStep(stepIndex)),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ownerTeam: tenantName,
    severityBands: index % 2 === 0 ? ['p0', 'p1'] : ['p2', 'p3'],
    objective: {
      name: `Objective ${tenantId}`,
      target: {
        tenantId,
        serviceId: `seed-service-${tenantId}`,
      } as RecoveryPlaybookContext,
      acceptedSlaMinutes: 30 + index * 2,
      owner: `owner-${tenantId}`,
    },
    windows: [
      {
        channel: 'global',
        tz: tenantName.includes('EU') ? 'UTC' : 'America/Chicago',
        fromHour: 0,
        toHour: 23,
      },
      {
        channel: 'main',
        tz: 'UTC',
        fromHour: 0,
        toHour: 23,
      },
    ],
    tags: {
      tenant: tenantId,
      band: buildRiskBand(index),
      index: String(index),
    },
  };
  return RecoveryPlaybookSchema.parse(envelope) as unknown as RecoveryPlaybook;
};

const persistPlaybook = async (
  repository: RecoveryPlaybookRepository,
  playbook: RecoveryPlaybook,
): Promise<SeedRun> => {
  const saveResult = await repository.save(playbook);
  if (!saveResult.ok) {
    return {
      runId: `run:${String(playbook.id)}`,
      status: 'fail',
      reason: saveResult.error,
    };
  }
  return {
    runId: `run:${String(playbook.id)}`,
    status: 'ok',
  };
};

export const seedPlaybooks = async (
  repository: RecoveryPlaybookRepository,
  options: SeedOptions,
): Promise<readonly SeedRun[]> => {
  const count = Math.min(Math.max(1, options.count), 80);
  const targets = Array.from({ length: count }, (_, index) => buildSeededPlaybook(options.tenantId, options.tenantName, index));
  const results = await Promise.all(targets.map((playbook) => persistPlaybook(repository, playbook)));
  return results;
};

export const seedRecoveryPlaybookRepository = async (
  repository: RecoveryPlaybookRepository = new InMemoryRecoveryPlaybookRepository(),
): Promise<readonly SeededPlaybook[]> => {
  const tenantContexts: Array<{ tenantId: string; tenantName: string }> = [
    { tenantId: 'tenant-alpha', tenantName: 'Alpha Team' },
    { tenantId: 'tenant-beta', tenantName: 'Beta Team' },
    { tenantId: 'tenant-gamma', tenantName: 'Gamma Team' },
  ];

  const allRuns = await Promise.all(
    tenantContexts.map((tenant) =>
      seedPlaybooks(repository, {
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        locale: 'UTC',
        count: 7,
      }),
    ),
  );

  return allRuns.flat().filter((run) => run.status === 'ok').map((run) => ({
    id: withBrand(run.runId.replace('run:', ''), 'RecoveryPlaybookId'),
    title: run.runId,
    tenant: run.runId.split(':')[1] ?? 'tenant-unknown',
  }));
};

export const buildSeedContext = (tenantId: string): RecoveryPlaybookContext => {
  const base = {
    tenantId,
    serviceId: `seed-service-${tenantId}`,
    incidentType: 'seed',
    affectedRegions: ['global'],
    triggeredBy: `seed:${tenantId}`,
  };
  return base;
};

export const buildSeedQuery = (tenantId: string): RecoveryPlaybookQuery => ({
  tenantId: withBrand(`${tenantId}:seed`, 'TenantId'),
  status: 'published',
  labels: ['automated', tenantId],
  categories: ['recovery'],
  severityBands: ['p0', 'p1', 'p2'],
  limit: 100,
});

export const validateSeed = (value: unknown): boolean => {
  return RecoveryPlaybookSchema.safeParse(value).success;
};
