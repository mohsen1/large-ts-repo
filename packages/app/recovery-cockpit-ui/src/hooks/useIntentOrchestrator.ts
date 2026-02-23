import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createBlankIntent,
  appendStep,
  estimateUrgencyScore,
  simulateIntentRecovery,
  normalizeMode,
  normalizePriority,
  normalizeScope,
  markMonitoring,
  markCompleted,
  markAborted,
  RecoveryIntent,
} from '@domain/recovery-cockpit-orchestration-core';
import { InMemoryIntentStore } from '@data/recovery-cockpit-intent-store';
import { createIntentOrchestrator, CockpitIntentOrchestratorConfig } from '@service/recovery-cockpit-intent-orchestrator';
import { toHeatTile, buildOverview } from '@data/recovery-cockpit-intent-store';

export type UseIntentOrchestratorOptions = Partial<CockpitIntentOrchestratorConfig>;

export type IntentOrchestratorState = {
  running: boolean;
  intents: RecoveryIntent[];
  selectedIntentId: string;
  statusText: string;
  overviewSummary: string;
};

export type IntentOrchestratorActions = {
  seedScenarios(): Promise<void>;
  selectIntent(intentId: string): void;
  runOrchestrator(): Promise<void>;
  addStep(step: {
    key: string;
    action: string;
    operator: string;
    service: string;
    expectedMinutes: number;
    requiredCapabilities: string[];
  }): Promise<void>;
  promoteActive(intentId: string): void;
  finishIntent(intentId: string): void;
  abortIntent(intentId: string): void;
};

const initialIntent = () =>
  createBlankIntent({
    title: 'Recovery drill: control-plane stabilization',
    scope: normalizeScope('platform'),
    priority: normalizePriority('high'),
    mode: normalizeMode('recover'),
    operator: 'recovery-orchestrator',
    zone: 'us-east-1',
    tagBucket: ['stabilize', 'forecast', 'high-intensity'],
  });

export const useIntentOrchestrator = (
  options: UseIntentOrchestratorOptions = {},
): IntentOrchestratorState & IntentOrchestratorActions => {
  const [running, setRunning] = useState(false);
  const [intents, setIntents] = useState<RecoveryIntent[]>([]);
  const [selectedIntentId, setSelectedIntentId] = useState('');
  const [statusText, setStatusText] = useState('idle');
  const [overviewSummary, setOverviewSummary] = useState('no data');

  const store = useMemo(() => new InMemoryIntentStore(), []);
  const analytics = useMemo(() => ({ refresh: async () => {} }), []);
  const orchestrator = useMemo(
    () => createIntentOrchestrator(store, analytics, { ...options, parallelism: options.parallelism ?? 4, simulationEnabled: true }),
    [store, analytics, options.parallelism, options.maxActive, options.allowThrottle, options.enforceManualReview, options.criticalMode],
  );

  const hydrate = useCallback(async () => {
    const snapshot = await store.listIntents();
    if (!snapshot.ok) {
      return;
    }
    const list = snapshot.value;
    setIntents([...list]);
    if (!selectedIntentId && list.length) {
      setSelectedIntentId(list[0].intentId);
    }

    const overview = buildOverview(list, { generatedAt: new Date().toISOString(), totalIntents: list.length, active: 0, completed: 0, aborted: 0 }, []);
    setOverviewSummary(`${overview.snapshot.totalIntents} intents · ${overview.hotspots.length} hot tiles`);
  }, [store, selectedIntentId]);

  const seedScenarios = useCallback(async () => {
    const baseline = initialIntent();
    const seeded = appendStep(baseline, {
      key: 'precheck',
      action: 'validate platform state',
      operator: 'platform-engine',
      service: 'control-plane',
      expectedMinutes: 12,
      requiredCapabilities: ['telemetry', 'rollback'],
    });
    const hydrated = appendStep(seeded, {
      key: 'scale',
      action: 'scale secondary controls',
      operator: 'platform-engine',
      service: 'kubernetes',
      expectedMinutes: 22,
      requiredCapabilities: ['k8s-read', 'k8s-write'],
    });
    await store.upsertIntent(hydrated);
    await hydrate();
    setStatusText('seeded baseline scenario');
  }, [hydrate, store]);

  const selectIntent = (intentId: string) => {
    setSelectedIntentId(intentId);
  };

  const runOrchestrator = useCallback(async () => {
    setRunning(true);
    setStatusText('running scheduler');
    const selected = await orchestrator.schedule();
    const heartbeat = await orchestrator.heartbeat();
    setStatusText(`scheduled ${selected.length}, active=${heartbeat.inFlight}`);

      const latest = await store.listIntents();
    if (latest.ok) {
      setIntents([...latest.value]);
    }
    setRunning(false);
  }, [orchestrator, store]);

  const addStep = useCallback(
    async (step: {
      key: string;
      action: string;
      operator: string;
      service: string;
      expectedMinutes: number;
      requiredCapabilities: string[];
    }): Promise<void> => {
      const current = intents.find((candidate) => candidate.intentId === selectedIntentId);
      if (!current) {
        return;
      }
      const next = appendStep(current, {
        ...step,
        expectedMinutes: Math.max(1, step.expectedMinutes),
      });
      await store.upsertIntent(next);
      await hydrate();
      setStatusText(`step added to ${next.intentId}`);
    },
    [intents, selectedIntentId, store, hydrate],
  );

  const promoteActive = useCallback(
    (intentId: string) => {
      const target = intents.find((entry) => entry.intentId === intentId);
      if (!target) return;
      const next = markMonitoring(appendStep(target, {
        key: `ops-${Date.now()}`,
        action: 'validate dependency chain',
        operator: target.operator,
        service: target.scope,
        expectedMinutes: 15,
        requiredCapabilities: ['dependency-watch', 'runbook'],
      }));
      void store.upsertIntent(next).then(() => hydrate());
      const simulation = simulateIntentRecovery(next);
      void simulation;
      setStatusText(`promoted ${next.intentId}; urgency=${estimateUrgencyScore(next)}`);
    },
    [intents, store, hydrate],
  );

  const finishIntent = useCallback(
    async (intentId: string) => {
      const target = intents.find((intent) => intent.intentId === intentId);
      if (!target) {
        return;
      }
      await store.upsertIntent(markCompleted(target));
      await hydrate();
      setStatusText(`finished ${intentId}`);
    },
    [intents, store, hydrate],
  );

  const abortIntent = useCallback(
    async (intentId: string): Promise<void> => {
      const target = intents.find((intent) => intent.intentId === intentId);
      if (!target) {
        return;
      }
      await store.upsertIntent(markAborted(target, 'aborted by operator'));
      await hydrate();
      setStatusText(`aborted ${intentId}`);
    },
    [intents, store, hydrate],
  );

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const tileSummary = intents.map((intent) => toHeatTile(intent)).map((tile) => `${tile.intentId}:${tile.risk}`).join(' | ');
    void tileSummary;
  }, [intents]);

  return {
    running,
    intents,
    selectedIntentId,
    statusText,
    overviewSummary,
    seedScenarios,
    selectIntent,
    runOrchestrator,
    addStep,
    promoteActive,
    finishIntent,
    abortIntent,
  };
};
