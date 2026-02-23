import type { CadencePlan, CadenceIntent, CadenceWindowForecast } from '@domain/recovery-cadence-orchestration';

export interface CadenceLabViewProps {
  readonly title: string;
  readonly plan?: CadencePlan;
  readonly onRefresh: () => void;
}

export interface CadenceLabState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly selectedPlanId?: CadencePlan['id'];
  readonly selectedWindowCount: number;
  readonly plans: readonly CadencePlan[];
  readonly forecasts: Readonly<Record<CadencePlan['id'], CadenceWindowForecast[]>>;
  readonly intents: Readonly<Record<CadencePlan['id'], readonly CadenceIntent[]>>;
  readonly message?: string;
}

export interface CadenceLabSummary {
  readonly planId: CadencePlan['id'];
  readonly displayName: string;
  readonly windowCount: number;
  readonly owner: string;
  readonly warningCount: number;
}
