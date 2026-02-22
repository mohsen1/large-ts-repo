import type { StabilitySignal, StabilityWindow, StabilityRunId, ServiceNodeId } from '@domain/recovery-stability-models';
import type { StabilitySignalId } from '@domain/recovery-stability-models';

export interface StoreFilter {
  readonly runId?: StabilityRunId;
  readonly serviceIds?: readonly ServiceNodeId[];
  readonly alertClass?: StabilitySignal['alertClass'];
  readonly minValue?: number;
  readonly window?: StabilityWindow;
  readonly ids?: readonly StabilitySignalId[];
}

export const filterByWindow = (
  signals: readonly StabilitySignal[],
  window?: StabilityWindow,
): readonly StabilitySignal[] => {
  if (!window) return signals;
  return signals.filter((signal) => signal.window === window);
};

export const filterByServiceIds = (
  signals: readonly StabilitySignal[],
  serviceIds?: readonly ServiceNodeId[],
): readonly StabilitySignal[] => {
  if (!serviceIds || serviceIds.length === 0) return signals;
  const allow = new Set(serviceIds);
  return signals.filter((signal) => allow.has(signal.serviceId));
};

export const filterByClass = (
  signals: readonly StabilitySignal[],
  alertClass?: StabilitySignal['alertClass'],
): readonly StabilitySignal[] => {
  if (!alertClass) return signals;
  return signals.filter((signal) => signal.alertClass === alertClass);
};

export const filterByValue = (
  signals: readonly StabilitySignal[],
  minValue?: number,
): readonly StabilitySignal[] => {
  if (minValue === undefined) return signals;
  return signals.filter((signal) => signal.value >= minValue);
};

export const filterByIds = (
  signals: readonly StabilitySignal[],
  ids?: readonly StabilitySignalId[],
): readonly StabilitySignal[] => {
  if (!ids || ids.length === 0) return signals;
  const allowed = new Set(ids);
  return signals.filter((signal) => allowed.has(signal.id));
};

export const applyFilter = (signals: readonly StabilitySignal[], filter: StoreFilter): readonly StabilitySignal[] => {
  return filterByIds(
    filterByValue(
      filterByClass(
        filterByServiceIds(
          filterByWindow(signals, filter.window),
          filter.serviceIds,
        ),
        filter.alertClass,
      ),
      filter.minValue,
    ),
    filter.ids,
  );
};
