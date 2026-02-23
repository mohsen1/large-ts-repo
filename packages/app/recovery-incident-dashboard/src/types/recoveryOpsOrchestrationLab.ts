import type { OrchestrationLabWorkspaceView } from '@service/recovery-incident-orchestrator';
import type { OrchestrationLab } from '@domain/recovery-ops-orchestration-lab';
import type { LabPlan } from '@domain/recovery-ops-orchestration-lab';

export interface OrchestrationLabPageProps {
  readonly lab: OrchestrationLab;
  readonly onSelect?: (planId?: LabPlan['id']) => void;
  readonly onRun?: (planId?: LabPlan['id']) => void;
}

export interface OrchestrationLabTimelinePoint {
  readonly timestamp: string;
  readonly label: string;
}

export interface RecoveryOpsOrchestrationLabState {
  readonly workspace?: OrchestrationLabWorkspaceView;
  readonly loading: boolean;
  readonly error?: string;
  readonly signalCount: number;
  readonly candidateCount: number;
  readonly timeline: readonly OrchestrationLabTimelinePoint[];
  readonly selectedPlanId?: LabPlan['id'];
  readonly selectPlan: (planId: LabPlan['id']) => Promise<void>;
  readonly runPlan: () => Promise<void>;
}
