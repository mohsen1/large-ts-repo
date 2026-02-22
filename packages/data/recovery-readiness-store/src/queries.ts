import type { SignalFilter, ReadinessReadModel } from './models';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';

export interface ReadModelIndex {
  items: ReadinessReadModel[];
}

function matchesFilter(model: ReadinessReadModel, filter: SignalFilter): boolean {
  if (!filter.runId) {
    return true;
  }

  if (model.plan.runId !== filter.runId) {
    return false;
  }

  if (filter.source) {
    const hasSource = model.signals.some((entry) => entry.source === filter.source);
    if (!hasSource) {
      return false;
    }
  }

  if (filter.minSeverity) {
    const ordered: RecoveryReadinessPlan['windows'][number]['fromUtc'][] = [];
    const min = ['low', 'medium', 'high', 'critical'].indexOf(filter.minSeverity);
    const hasMin = model.signals.some((entry) => ['low', 'medium', 'high', 'critical'].indexOf(entry.severity) >= min);
    if (!hasMin) {
      return false;
    }
  }

  return true;
}

export function filterBySignalCriteria(models: ReadonlyArray<ReadinessReadModel>, filter: SignalFilter): ReadinessReadModel[] {
  return models.filter((model) => matchesFilter(model, filter));
}

export function sortByRiskBand(models: ReadinessReadModel[]): ReadinessReadModel[] {
  const riskPriority = { green: 0, amber: 1, red: 2 } as const;
  return [...models].sort((left, right) => {
    const delta = riskPriority[right.plan.riskBand] - riskPriority[left.plan.riskBand];
    if (delta !== 0) {
      return delta;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}
