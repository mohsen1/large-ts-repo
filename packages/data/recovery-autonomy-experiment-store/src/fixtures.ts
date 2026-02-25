import { randomUUID } from 'node:crypto';
import { makeRunId, type TenantId } from '@domain/recovery-autonomy-experiment';

export const fixturePhases = ['prepare', 'inject', 'observe', 'adapt', 'recover', 'verify'] as const;
export const fixturePlanId = `plan:${randomUUID()}`;
export const fixtureRunIds = [makeRunId('tenant:fixture-a' as TenantId, randomUUID()), makeRunId('tenant:fixture-b' as TenantId, randomUUID()), makeRunId('tenant:fixture-c' as TenantId, randomUUID())] as const;

export const fixtureSummary = {
  label: 'recovery-autonomy-experiment-store',
  phaseCount: fixturePhases.length,
  runCount: fixtureRunIds.length,
  defaultPhases: [...fixturePhases],
} as const;
