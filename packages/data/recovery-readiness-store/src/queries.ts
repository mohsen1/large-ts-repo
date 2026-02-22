import type { SignalFilter, ReadinessReadModel } from './models';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { ReadinessRunId } from '@domain/recovery-readiness';

const severityPriority: Record<RecoveryReadinessPlan['riskBand'], number> = {
  green: 0,
  amber: 1,
  red: 2,
};

function matchesFilter(model: ReadinessReadModel, filter: SignalFilter): boolean {
  if (!filter.runId) {
    return true;
  }

  if (model.plan.runId !== (filter.runId as ReadinessRunId)) {
    return false;
  }

  if (filter.source) {
    const hasSource = model.signals.some((entry) => entry.source === filter.source);
    if (!hasSource) {
      return false;
    }
  }

  if (filter.minSeverity) {
    const min = ['low', 'medium', 'high', 'critical'].indexOf(filter.minSeverity);
    const hasMin = model.signals.some(
      (entry) => ['low', 'medium', 'high', 'critical'].indexOf(entry.severity) >= min,
    );
    if (!hasMin) {
      return false;
    }
  }

  if (filter.planState && model.plan.state !== filter.planState) {
    return false;
  }

  if (filter.tags && filter.tags.length > 0) {
    const hasAllTags = filter.tags.every((tag) => model.plan.metadata.tags.includes(tag));
    if (!hasAllTags) {
      return false;
    }
  }

  return true;
}

export function filterBySignalCriteria(models: ReadonlyArray<ReadinessReadModel>, filter: SignalFilter): ReadinessReadModel[] {
  return models.filter((model) => matchesFilter(model, filter));
}

export function sortByRiskBand(models: ReadinessReadModel[]): ReadinessReadModel[] {
  return [...models].sort((left, right) => {
    const delta = severityPriority[right.plan.riskBand] - severityPriority[left.plan.riskBand];
    if (delta !== 0) {
      return delta;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function summarizeByOwner(models: ReadinessReadModel[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const model of models) {
    const owner = model.plan.metadata.owner;
    map.set(owner, (map.get(owner) ?? 0) + 1);
  }
  return map;
}

export function rankBySignalVolume(models: ReadinessReadModel[]): ReadinessReadModel[] {
  return [...models].sort((left, right) => right.signals.length - left.signals.length);
}

export function selectTopRunId(models: ReadinessReadModel[], index = 0): ReadinessReadModel | undefined {
  const ordered = [...sortByRiskBand(models)];
  return ordered[index] ?? undefined;
}
