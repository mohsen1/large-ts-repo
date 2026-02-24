import { DomainVersion, EntityId, PlanId, RecoveryPlan, Region, ServiceCode, toTimestamp } from '@domain/recovery-cockpit-models';
import { useMemo } from 'react';
import { OrchestrationPolicyMatrix } from '../components/orchestration/OrchestrationPolicyMatrix';
import { OrchestrationRunbookConsole } from '../components/orchestration/OrchestrationRunbookConsole';
import { OrchestrationTopologyPanel } from '../components/orchestration/OrchestrationTopologyPanel';
import { useReadinessForecast } from '../hooks/useReadinessForecast';

const nextActionId = (planIndex: number): EntityId => `action-${planIndex}-${Date.now()}` as EntityId;
const nextServiceCode = (planIndex: number): ServiceCode => `svc-${planIndex}` as ServiceCode;
const nextRegion = (planIndex: number): Region => `reg-${planIndex}` as Region;
const nextPlanId = (planIndex: number): PlanId => `plan-${planIndex}` as PlanId;

const mockPlans = (planCount: number): RecoveryPlan[] =>
  Array.from({ length: planCount }, (_, index): RecoveryPlan => {
    const action = {
      id: nextActionId(index),
      serviceCode: nextServiceCode(index),
      region: nextRegion(index),
      command: 'noop',
      desiredState: 'up' as const,
      dependencies: [] as EntityId[],
      expectedDurationMinutes: 4 + index,
      retriesAllowed: 2,
      tags: ['synthetic'],
    };

    return {
      planId: nextPlanId(index),
      labels: {
        short: `Plan ${index + 1}`,
        long: `Synthetic plan ${index + 1}`,
        emoji: '🧭',
        labels: ['synthetic'],
      },
      title: `Plan ${index + 1}`,
      description: `Synthetic scenario ${index + 1}`,
      mode: 'manual',
      actions: [action],
      audit: [],
      slaMinutes: 15,
      isSafe: true,
      version: 1 as DomainVersion,
      effectiveAt: toTimestamp(new Date(Date.now() - (index * 86_400_000))),
    };
  });

export const RecoveryCockpitAdvancedOrchestrationPage = () => {
  const planCatalog = useMemo(() => mockPlans(8), []);
  const baseForecast = useReadinessForecast(planCatalog[0], 'balanced');

  return (
    <div style={{ display: 'grid', gap: 16, padding: 20, background: 'linear-gradient(180deg, #f1f5f9, #fff)' }}>
      <header>
        <h1 style={{ margin: 0, color: '#0f172a' }}>Advanced orchestration workspace</h1>
        <p style={{ color: '#334155', marginTop: 8 }}>
          Stress harness for advanced TypeScript orchestration with registry-aware execution, tracing, and domain models.
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        <OrchestrationPolicyMatrix plans={planCatalog} />
        <OrchestrationTopologyPanel workspaceId="recovery-cockpit-advanced" plans={planCatalog.map((plan) => ({ planId: plan.planId }))} />
      </section>

      <OrchestrationRunbookConsole workspaceId="recovery-cockpit-advanced" plans={planCatalog} />

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
        <h3>Readiness snapshot</h3>
        <pre style={{ background: '#0f172a', color: '#f8fafc', padding: 12, borderRadius: 8, overflowX: 'auto' }}>
          {JSON.stringify(baseForecast, null, 2)}
        </pre>
      </section>
    </div>
  );
};
