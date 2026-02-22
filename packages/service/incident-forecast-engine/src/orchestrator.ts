import { ForecastAlerts } from '@infrastructure/incident-forecasting-connectors';
import { latestForecastForTenant } from '@data/incident-forecast-store';
import { createProcessor } from './processor';
import { synthesizeWorkflow } from './workflow';
import type { ForecastRepository } from '@data/incident-forecast-store';

export interface ForecastOperatorConfig {
  readonly tenantId: string;
  readonly snsTopicArn?: string;
}

export interface ForecastOperator {
  process(payload: unknown): Promise<void>;
}

export const createForecastOperator = (config: ForecastOperatorConfig, repository: ForecastRepository): ForecastOperator => {
  const processor = createProcessor(repository);
  const alerts = config.snsTopicArn ? new ForecastAlerts() : undefined;

  return {
    process: async (payload: unknown) => {
      const result = await processor.processIncoming(payload);
      if (result.ok === false) {
        throw result.error;
      }

      const latest = await latestForecastForTenant(repository, config.tenantId);
      if (!latest) {
        return;
      }

      const workflow = synthesizeWorkflow(latest.signals);
      if (workflow.state === 'blocked') {
        return;
      }

      if (alerts && config.snsTopicArn) {
        await alerts.publish(config.snsTopicArn, latest.plan, latest.metric.score);
      }
    },
  };
};
