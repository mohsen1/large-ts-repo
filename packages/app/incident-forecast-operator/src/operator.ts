import { MemoryForecastRepository } from '@data/incident-forecast-store';
import { createForecastOperator } from '@service/incident-forecast-engine';

export interface OperatorOptions {
  readonly tenantId: string;
  readonly snsTopicArn?: string;
}

export const createIncidentForecastOperator = (options: OperatorOptions) => {
  const repository = new MemoryForecastRepository();
  const operator = createForecastOperator(options, repository);

  return {
    handlePayload: (payload: unknown) => operator.process(payload),
    runDry: async (payload: unknown) => {
      return operator.process(payload);
    },
  };
};
