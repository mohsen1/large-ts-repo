import type { ForecastDocument } from './models';
import type { ForecastRepository } from './forecast-store';

export const latestForecastForTenant = async (
  repository: ForecastRepository,
  tenantId: string,
): Promise<ForecastDocument | undefined> => {
  const all = await repository.listByTenant(tenantId);
  if (all.length === 0) {
    return undefined;
  }
  return all.reduce((latest, current) =>
    Date.parse(current.createdAt) > Date.parse(latest.createdAt) ? current : latest,
  all[0],
  );
};

export const filterByRiskThreshold = async (
  repository: ForecastRepository,
  tenantId: string,
  threshold: number,
): Promise<readonly ForecastDocument[]> => {
  const forecasts = await repository.listByTenant(tenantId);
  return forecasts.filter((entry) => entry.metric.score >= threshold);
};
