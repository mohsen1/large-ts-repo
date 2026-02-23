import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildOrchestrationRun,
} from '@service/recovery-ops-orchestration-engine';
import {
  type CommandSelectionCriteria,
  type CommandSurface,
  type CommandSurfaceId,
  type CommandSignalId,
  type CommandPlanId,
  type ExecutionWaveId,
  type CommandWaveStepId,
  type CommandWindowId,
  type CommandPlanSummary,
  type CommandOrchestrationResult,
  type CommandSurfaceQuery,
  type CommandRisk,
} from '@domain/recovery-ops-orchestration-surface';
import { RecoveryOpsOrchestrationStore } from '@data/recovery-ops-orchestration-store';

interface LabConfig {
  readonly tenantId: string;
  readonly scenarioId: string;
}

const defaultCriteria = (tenantId: string): CommandSelectionCriteria => ({
  preferredPhases: ['observe', 'stabilize', 'validate', 'handoff'],
  maxPlanMinutes: 180,
  minConfidence: 0.65,
  riskTolerance: 'medium',
  mandatoryTags: [tenantId, 'critical-path'],
});

const buildQuery = (config: LabConfig): CommandSurfaceQuery => ({
  tenantId: config.tenantId,
  scenarioId: config.scenarioId,
  minPriority: 5,
  maxRisk: 'high',
});

const normalizeSurfaces = (surfaces: readonly CommandSurface[]): CommandSurface[] => [...surfaces];

export interface UseRecoveryOpsOrchestrationLabResult {
  readonly summary: string;
  readonly summaries: readonly CommandPlanSummary[];
  readonly latest: CommandOrchestrationResult | undefined;
  readonly isLoading: boolean;
  readonly query: CommandSurfaceQuery;
  readonly planCount: number;
  readonly runOrchestrate: () => Promise<void>;
}

export const useRecoveryOpsOrchestrationLab = (config: LabConfig): UseRecoveryOpsOrchestrationLabResult => {
  const [surfaces, setSurfaces] = useState<readonly CommandSurface[]>([]);
  const [latest, setLatest] = useState<CommandOrchestrationResult | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const criteria = useMemo(() => defaultCriteria(config.tenantId), [config.tenantId]);
  const query = useMemo(() => buildQuery(config), [config]);

  const runOrchestrate = useCallback(async () => {
    if (!surfaces.length) {
      return;
    }

    setIsLoading(true);
    await Promise.resolve(
      new Promise((resolve) => setTimeout(resolve, 30)),
    );

    const primary = surfaces[0];
  const workspace = {
      surface: primary,
      criteria,
    };

    const output = buildOrchestrationRun(workspace);
    setLatest(output.selection);

    setIsLoading(false);
  }, [criteria, surfaces]);

  const planSummaries = useMemo(() => {
    if (!surfaces.length) {
      return [];
    }

    return normalizeSurfaces(surfaces).flatMap((surface) => {
      const result = buildOrchestrationRun({ surface, criteria });
      return result.summaries;
    });
  }, [criteria, surfaces]);

  const summary = useMemo(() => {
    const count = surfaces.length;
    const status = latest ? latest.ok : false;
    return `tenant=${config.tenantId} scenario=${config.scenarioId} surfaces=${count} status=${status ? 'ready' : 'idle'}`;
  }, [config.scenarioId, config.tenantId, latest, surfaces.length]);

  useEffect(() => {
    const store = new RecoveryOpsOrchestrationStore();
    const envelopeA = { id: `${config.tenantId}-${config.scenarioId}-surface`, surface: seedSurface(config), createdAt: new Date().toISOString(), queryContext: query, generatedBy: config.tenantId, metadata: {} } as const;

    store.addSurface(envelopeA);
    const fetched = store.searchSurfaces({ tenantId: config.tenantId, scenarioId: config.scenarioId, limit: 1 });
    const values = fetched.data.map((entry) => entry.surface);
    setSurfaces(normalizeSurfaces(values));
  }, [config.tenantId, config.scenarioId, query]);

  return {
    summary,
    summaries: planSummaries,
    latest,
    isLoading,
    query,
    planCount: planSummaries.length,
    runOrchestrate,
  };
};

const seedSurface = (config: LabConfig): CommandSurface => ({
  id: `${config.tenantId}-${config.scenarioId}-surface` as CommandSurfaceId,
  tenantId: config.tenantId,
  scenarioId: config.scenarioId,
  signals: [
    {
      id: `${config.tenantId}-signal-primary` as CommandSignalId,
      source: 'lab-observer',
      phase: 'observe',
      confidence: 0.87,
      impactScore: 0.91,
      createdAt: new Date().toISOString(),
      labels: ['primary', 'orchestration'],
      metadata: { scope: 'critical' },
    },
  ],
  availablePlans: [
    {
      id: `${config.scenarioId}-plan-primary` as CommandPlanId,
      surfaceId: `${config.tenantId}-${config.scenarioId}-surface` as CommandSurfaceId,
      intent: 'recovery',
      objectiveSummary: 'Restore payment path within 75 minutes',
      priority: 11,
      riskLevel: 'medium' as CommandRisk,
          waves: [
        {
          id: `${config.scenarioId}-wave-1` as ExecutionWaveId,
          planId: `${config.scenarioId}-plan-primary` as CommandPlanId,
          name: 'containment',
          steps: [
            {
              id: `${config.scenarioId}-wave-1-step-1` as CommandWaveStepId,
              name: 'isolate failing pod',
              phase: 'stabilize',
              commandTemplate: 'kubectl cordon <node>',
              owner: 'platform',
              estimatedMinutes: 12,
              slaMinutes: 20,
              criticality: 'high',
              dependencies: [],
              tags: ['isolation'],
              runbookRefs: ['rb-11'],
            },
          ],
          expectedDurationMinutes: 12,
          parallelism: 1,
          ownerTeam: 'platform',
          isCritical: true,
        },
      ],
      createdAt: new Date().toISOString(),
      owner: config.tenantId,
      tenant: config.tenantId,
      labels: ['primary', 'autogen'],
    },
  ],
  runtimeWindow: {
    id: `${config.scenarioId}-window` as CommandWindowId,
    start: new Date().toISOString(),
    end: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    timezone: 'UTC',
    blackoutWindows: [],
    targetRecoveryMinutes: 75,
  },
  metadata: {
    owner: config.tenantId,
    region: 'us-east-1',
    runbookVersion: '2026.02.0',
    environment: 'prod',
  },
});
