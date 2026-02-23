import { nextEntityId, toTimestamp, Region, ServiceCode } from '@domain/recovery-cockpit-models';
import { RecoveryPlan, RecoveryAction } from '@domain/recovery-cockpit-models';

const baseActions = (planRef: string): RecoveryAction[] => [
  {
    id: nextEntityId(`${planRef}-dns-check`),
    serviceCode: 'gateway' as ServiceCode,
    region: 'us-east-1' as Region,
    command: 'precheck:dns',
    desiredState: 'up',
    dependencies: [],
    expectedDurationMinutes: 10,
    retriesAllowed: 2,
    tags: ['readiness', 'dns'],
  },
  {
    id: nextEntityId(`${planRef}-drain`),
    serviceCode: 'api' as ServiceCode,
    region: 'us-east-1' as Region,
    command: 'drain:api',
    desiredState: 'drained',
    dependencies: [],
    expectedDurationMinutes: 25,
    retriesAllowed: 2,
    tags: ['traffic', 'scale'],
  },
];

export const fixturePlans = (): RecoveryPlan[] => {
  const first: RecoveryPlan = {
    planId: `fixture-${Math.random().toString(36).slice(2)}` as RecoveryPlan['planId'],
    labels: {
      short: 'Golden East',
      long: 'Golden failover orchestration',
      emoji: '🛰️',
      labels: ['golden', 'east', 'regional'],
    },
    version: 1 as RecoveryPlan['version'],
    mode: 'automated',
    title: 'Golden recovery runbook',
    description: 'Standard plan for high-impact regional failover.',
    actions: baseActions('plan-east'),
    audit: [],
    slaMinutes: 58,
    isSafe: true,
    effectiveAt: toTimestamp(new Date()),
  };

  const firstActions = baseActions('plan-west');
  const second: RecoveryPlan = {
    planId: `fixture-${Math.random().toString(36).slice(2)}` as RecoveryPlan['planId'],
    labels: {
      short: 'West Warm',
      long: 'Warm region re-bootstrap',
      emoji: '🧠',
      labels: ['west', 'manual', 'warm'],
    },
    version: 1 as RecoveryPlan['version'],
    mode: 'manual',
    title: 'Western edge rebootstrap',
    description: 'Manual playbook for partial outage recovery.',
    actions: [
      {
        ...firstActions[0],
        id: nextEntityId('plan-west-evac'),
        command: 'evacuate:edge',
      },
      {
        ...firstActions[1],
        id: nextEntityId('plan-west-rejoin'),
        command: 'rejoin:mesh',
        dependencies: [firstActions[0].id],
      },
    ],
    audit: [],
    slaMinutes: 93,
    isSafe: false,
    effectiveAt: toTimestamp(new Date()),
  };

  return [first, second];
};
