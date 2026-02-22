import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { fail, ok, type Result } from '@shared/result';
import type { IncidentForecastPlan } from '@domain/incident-forecasting';

export interface ForecastAlert {
  readonly tenantId: string;
  readonly planId: string;
  readonly severityBand: string;
  readonly riskScore: number;
  readonly action: string;
}

export class ForecastAlerts {
  private readonly client = new SNSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

  async publish(topicArn: string, plan: IncidentForecastPlan, riskScore: number): Promise<Result<string, Error>> {
    const alert: ForecastAlert = {
      tenantId: plan.tenantId,
      planId: String(plan.planId),
      severityBand: riskScore > 70 ? 'high' : 'low',
      riskScore,
      action: `execute:${plan.playbookSteps[0] ?? 'noop'}`,
    };

    try {
      const response = await this.client.send(
        new PublishCommand({
          TopicArn: topicArn,
          Message: JSON.stringify(alert),
          Subject: `Incident forecast for ${plan.tenantId}`,
        }),
      );
      return ok(response.MessageId ?? 'unknown');
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('sns-publish-failed'));
    }
  }
}
