import type { CadencePlan } from '@domain/recovery-cadence-orchestration';

export const fallbackPlan: CadencePlan = {
  id: 'fallback-plan' as CadencePlan['id'],
  organizationId: 'ops-org',
  displayName: 'Recovery fallback plan',
  templateId: 'fallback-template' as CadencePlan['templateId'],
  status: 'active',
  owner: 'system',
  objective: {
    target: 'keep operations steady under burst load',
    constraints: ['no-overlap-with-maintenance'],
  },
  windows: [],
  intentIds: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
