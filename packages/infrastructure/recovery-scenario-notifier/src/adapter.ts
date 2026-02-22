import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { SNSClient } from '@aws-sdk/client-sns';
import { EventBridgeClient as EvClient } from '@aws-sdk/client-eventbridge';
import { SNSClient as SnsClient } from '@aws-sdk/client-sns';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import { publishScenarioEvent } from './eventbridge';
import { publishScenarioNotification } from './sns';
import type { RecoverySimulationResult } from '@domain/recovery-scenario-planner';
import { type ScenarioId } from '@domain/recovery-scenario-planner';

export interface RecoveryNotificationPayload {
  readonly scenarioId: ScenarioId;
  readonly tenantId: string;
  readonly impact: 'low' | 'medium' | 'high' | 'critical';
  readonly status: RecoverySimulationResult['windowState'];
  readonly riskScore: number;
  readonly occurredAtUtc: string;
}

export interface NotifierDependencies {
  readonly eventBridgeClient?: EventBridgeClient;
  readonly snsClient?: SNSClient;
  readonly eventBridgeBusName?: string;
  readonly snsTopicArn?: string;
}

export const buildRecoveryNotificationPayload = (
  simulation: RecoverySimulationResult,
): RecoveryNotificationPayload => ({
  scenarioId: simulation.scenarioId,
  tenantId: simulation.tenantId,
  impact: simulation.finalRiskScore > 0.75 ? 'critical' : simulation.finalRiskScore > 0.55 ? 'high' : 'medium',
  status: simulation.windowState,
  riskScore: simulation.finalRiskScore,
  occurredAtUtc: simulation.actionPlan.createdAtUtc,
});

export const notifyRecoveryScenario = async (
  simulation: RecoverySimulationResult,
  deps: NotifierDependencies,
): Promise<Result<{ readonly eventId?: string; readonly messageId?: string }, Error>> => {
  const payload = buildRecoveryNotificationPayload(simulation);
  const now = new Date().toISOString();

  const eventId = payload.impact === 'critical' ? await emitEvent(simulation, deps, payload) : undefined;

  if (!deps.snsClient || !deps.snsTopicArn) {
    return ok({ ...(eventId ? { eventId } : {} ) });
  }

  const messageIdResult = await publishScenarioNotification(
    deps.snsClient,
    { ...payload, occurredAtUtc: now },
    { topicArn: deps.snsTopicArn },
  );

  if (!messageIdResult.ok) {
    return fail(messageIdResult.error);
  }

  return ok({
    ...(eventId ? { eventId } : {}),
    messageId: messageIdResult.value,
  });
};

const emitEvent = async (
  simulation: RecoverySimulationResult,
  deps: NotifierDependencies,
  payload: RecoveryNotificationPayload,
): Promise<string | undefined> => {
  if (!deps.eventBridgeClient || !deps.eventBridgeBusName) return undefined;

  const result = await publishScenarioEvent(
    deps.eventBridgeClient,
    { ...payload },
    {
      eventBusName: deps.eventBridgeBusName,
      detailType: 'recovery-scenario',
      source: 'recovery.scenario',
    },
  );

  return result.ok ? result.value : undefined;
};

export const defaultClients = (): NotifierDependencies => ({
  eventBridgeClient: new EvClient({}),
  snsClient: new SnsClient({}),
  eventBridgeBusName: 'default',
  snsTopicArn: 'arn:aws:sns:us-east-1:000000000000:recovery-scenarios',
});
