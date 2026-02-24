import { useMemo } from 'react';
import { PlanId, RecoveryBlueprint, RecoveryPlan } from '@domain/recovery-cockpit-models';
import { summarizeBlueprint } from '@domain/recovery-cockpit-models';

type BlueprintOrchestratorMode = 'analysis' | 'simulate' | 'execute' | 'verify';

type BlueprintModeAction = {
  readonly label: string;
  readonly value: BlueprintOrchestratorMode;
};

const MODE_LIST: readonly BlueprintModeAction[] = [
  { label: 'Analysis', value: 'analysis' },
  { label: 'Simulate', value: 'simulate' },
  { label: 'Execute', value: 'execute' },
  { label: 'Verify', value: 'verify' },
];

type BlueprintControlPanelProps = {
  readonly plans: readonly RecoveryPlan[];
  readonly blueprints: readonly RecoveryBlueprint[];
  readonly selectedPlanId: PlanId;
  readonly selectedBlueprintId: string;
  readonly running: boolean;
  readonly executing: boolean;
  onSeed: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onRun: (planId: PlanId, mode: BlueprintOrchestratorMode) => Promise<void>;
  onQueue: (blueprint: RecoveryBlueprint, mode: BlueprintOrchestratorMode) => Promise<void>;
  onPlanSelect: (planId: PlanId) => void;
  onBlueprintSelect: (blueprintId: RecoveryBlueprint['blueprintId']) => void;
};

export const BlueprintControlPanel = ({
  plans,
  blueprints,
  selectedPlanId,
  selectedBlueprintId,
  running,
  executing,
  onSeed,
  onRefresh,
  onRun,
  onQueue,
  onPlanSelect,
  onBlueprintSelect,
}: BlueprintControlPanelProps) => {
  const normalized = useMemo(() => [...plans], [plans]);
  const activeBlueprint = blueprints.find((entry) => entry.blueprintId === selectedBlueprintId);
  const activeSummary = useMemo(() => (activeBlueprint ? summarizeBlueprint(activeBlueprint) : null), [activeBlueprint]);
  const disabled = running || executing;

  const runButtons = (planId: PlanId) =>
    MODE_LIST.map((mode) => (
      <button
        key={`${planId}:${mode.value}`}
        type="button"
        onClick={() => void onRun(planId, mode.value)}
        disabled={disabled}
      >
        {mode.label}
      </button>
    ));

  const blueprintQueueButtons = activeBlueprint
    ? MODE_LIST.map((mode) => (
      <button
        key={`${activeBlueprint.blueprintId}:${mode.value}`}
        type="button"
        onClick={() => void onQueue(activeBlueprint, mode.value)}
        disabled={disabled || activeBlueprint.steps.length === 0}
      >
        Queue {mode.label}
      </button>
    ))
    : [];

  return (
    <section
      style={{
        padding: 16,
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        background: 'linear-gradient(180deg,#f8fafc,#fff)',
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Blueprint orchestration control</h2>
        <p style={{ marginTop: 8, color: '#334155' }}>
          Stress workload with seeded plans, direct executions, and blueprint queue replay.
        </p>
      </header>

      <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void onSeed()} disabled={disabled}>
            Seed 6 plans
          </button>
          <button type="button" onClick={() => void onRefresh()} disabled={disabled}>
            Refresh snapshot
          </button>
          <span style={{ alignSelf: 'center', color: '#64748b' }}>
            Plans: {plans.length}, Blueprints: {blueprints.length}
          </span>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, color: '#475569', fontSize: 14 }}>Select plan</label>
          <select
            value={selectedPlanId}
            onChange={(event) => onPlanSelect(event.target.value as PlanId)}
            style={{ minWidth: 360 }}
            disabled={disabled}
          >
            {normalized.map((plan) => (
              <option key={plan.planId} value={plan.planId}>
                {plan.labels.short}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ color: '#334155' }}>Plan run controls</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{runButtons(selectedPlanId)}</div>
      </div>

      <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
        <label style={{ color: '#334155' }}>
          Blueprint queue ({activeBlueprint?.blueprintId ?? 'none selected'})
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{blueprintQueueButtons}</div>
        <div>
          <label style={{ display: 'block', marginBottom: 6 }}>Blueprint picker</label>
          <select
            value={selectedBlueprintId}
            onChange={(event) => onBlueprintSelect(event.target.value as RecoveryBlueprint['blueprintId'])}
            style={{ minWidth: 360 }}
            disabled={disabled}
          >
            {blueprints.map((item) => {
              const summary = summarizeBlueprint(item);
              return (
                <option key={item.blueprintId} value={item.blueprintId}>
                  {summary.id}: {summary.risk}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {activeSummary ? (
        <pre style={{ marginTop: 16, background: '#0f172a', color: '#f8fafc', padding: 12, borderRadius: 8 }}>
          {JSON.stringify(activeSummary, null, 2)}
        </pre>
      ) : null}
    </section>
  );
};
