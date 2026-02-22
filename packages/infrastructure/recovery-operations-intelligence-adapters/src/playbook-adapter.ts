import { withBrand } from '@shared/core';
import type { Brand } from '@shared/type-level';
import type { RunAssessment, CohortSignalAggregate } from '@domain/recovery-operations-intelligence';
import { buildExecution, matchesQuery, pickTopSteps, rankPlaybooks, type RecoveryPlaybook, type RecoveryPlaybookQuery, type PlaybookSelectionPolicy, type RecoveryPlanExecution, type RecoveryPlaybookId } from '@domain/recovery-playbooks';
import type { RecoveryPlaybookRepository } from '@data/recovery-playbook-store';
import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';

export type AdapterEventId = Brand<string, 'AdapterEventId'>;

export interface PlaybookEnvelope {
  readonly runId: string;
  readonly tenant: string;
  readonly playbookId: RecoveryPlaybookId;
  readonly selectedSteps: readonly string[];
  readonly events: readonly AdapterEvent[];
}

export interface AdapterEvent {
  readonly id: AdapterEventId;
  readonly type: 'playbook.selected' | 'playbook.executed' | 'playbook.skipped';
  readonly reason: string;
  readonly at: string;
}

export interface PlaybookSelectionInput {
  readonly tenant: string;
  readonly runId: string;
  readonly assessments: readonly RunAssessment[];
  readonly cohorts: readonly CohortSignalAggregate[];
  readonly policy: PlaybookSelectionPolicy;
  readonly repository: RecoveryPlaybookRepository;
}

export interface PlaybookSelectionOutput {
  readonly tenant: string;
  readonly runId: string;
  readonly selected: readonly string[];
  readonly executionId: string;
  readonly skipped: readonly string[];
  readonly events: readonly AdapterEvent[];
}

const selectQueries = (tenant: string, cohorts: readonly CohortSignalAggregate[]): RecoveryPlaybookQuery => {
  const labels = Array.from(new Set(cohorts.flatMap((cohort) => cohort.distinctSources)));
  const hasRed = labels.some((label) => label.includes('red'));
  const hasAmber = labels.some((label) => label.includes('amber'));

  return {
    tenantId: withBrand(tenant, 'TenantId'),
    categories: hasRed ? ['critical'] : hasAmber ? ['standard'] : ['general'],
    labels: labels.length ? labels : [tenant],
    severityBands: ['p1', 'p2', 'p3'],
    limit: 20,
    cursor: '0',
  };
};

const toExecution = (playbook: RecoveryPlaybook, runId: string): RecoveryPlanExecution => {
  const ranked = rankPlaybooks(
    [playbook],
    {
      maxStepsPerRun: playbook.steps.length,
      allowedStatuses: ['published', 'draft'],
      requiredLabels: [],
      forbiddenChannels: [],
    },
  );
  const selected = pickTopSteps(ranked, {
    maxStepsPerRun: 8,
    allowedStatuses: ['published', 'draft'],
    requiredLabels: [],
    forbiddenChannels: [],
  }, 8);
  return buildExecution(playbook.id, runId, selected);
};

const makeEvent = (type: AdapterEvent['type'], reason: string): AdapterEvent => ({
  id: withBrand(`${type}-${Date.now()}`, 'AdapterEventId'),
  type,
  reason,
  at: new Date().toISOString(),
});

export const resolveCandidatePlaybooks = async (
  repository: RecoveryPlaybookRepository,
  query: RecoveryPlaybookQuery,
): Promise<Result<readonly RecoveryPlaybook[], string>> => {
  const found = await repository.query(query);
  if (!found.ok) {
    return fail(found.error);
  }

  const candidates = found.value.items
    .map((item) => item.playbook)
    .filter((playbook) => matchesQuery(playbook, query));
  return ok(candidates);
};

export const buildAdapterEnvelope = (
  tenant: string,
  runId: string,
  selected: readonly RecoveryPlaybook[],
): PlaybookEnvelope => {
  const selectedSteps = selected.flatMap((playbook) => playbook.steps.map((step) => step.id));
  return {
    runId,
    tenant,
    playbookId: selected[0]?.id ?? ('' as RecoveryPlaybookId),
    selectedSteps,
    events: selected.map((playbook) => ({
      id: withBrand(`selected-${playbook.id}`, 'AdapterEventId'),
      type: 'playbook.selected',
      reason: `ranked:${playbook.title}`,
      at: new Date().toISOString(),
    })),
  };
};

export const buildPlaybookExecutionEnvelope = (
  tenant: string,
  runId: string,
  execution: RecoveryPlanExecution,
): PlaybookEnvelope => ({
  runId,
  tenant,
  playbookId: execution.playbookId,
  selectedSteps: execution.selectedStepIds,
  events: [
    {
      id: withBrand(`exec-${execution.id}`, 'AdapterEventId'),
      type: 'playbook.executed',
      reason: `status:${execution.status}`,
      at: execution.startedAt ?? new Date().toISOString(),
    },
  ],
});

export const adaptPlaybooks = async (input: PlaybookSelectionInput): Promise<Result<PlaybookSelectionOutput, string>> => {
  const query = selectQueries(input.tenant, input.cohorts);
  const candidates = await resolveCandidatePlaybooks(input.repository, query);
  if (!candidates.ok) {
    return fail(candidates.error);
  }

  const ranked = rankPlaybooks(candidates.value, input.policy);
  const top = pickTopSteps(ranked, input.policy, 3);
  const events: AdapterEvent[] = [];
  const selected: string[] = [];
  const skipped: string[] = [];
  const executions: RecoveryPlanExecution[] = [];

  for (const entry of top) {
    if (entry.score < 0.65) {
      skipped.push(entry.playbook.id);
      events.push(makeEvent('playbook.skipped', `low-score:${entry.score}`));
      continue;
    }

    const execution = toExecution(entry.playbook, `${input.tenant}-${input.runId}`);
    executions.push(execution);
    selected.push(entry.playbook.id);
    events.push(makeEvent('playbook.selected', `selected:${entry.playbook.id}`));
  }

  const execution = executions[0];
  const envelope = execution ? buildPlaybookExecutionEnvelope(input.tenant, input.runId, execution) : buildAdapterEnvelope(input.tenant, input.runId, []);
  return ok({
    tenant: input.tenant,
    runId: input.runId,
    selected,
    executionId: envelope.playbookId,
    skipped,
    events: [...envelope.events, ...events],
  });
};
