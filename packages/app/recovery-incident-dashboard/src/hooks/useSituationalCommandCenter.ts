import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  executeCommandCenter,
  executeCommandCenterBatch,
  finalizeCommandCenter,
  refreshTelemetryPulse,
} from '@service/recovery-situational-orchestrator';
import type {
  OrchestrateRequest,
  OrchestrateResponse,
  TelemetryPulse,
} from '@service/recovery-situational-orchestrator';
import type { SituationalAssessment } from '@domain/recovery-situational-intelligence';
import type { RecoveryPlanCandidate } from '@domain/recovery-situational-intelligence';
import { createSituationalStore } from '@data/recovery-situational-store';
import type { SituationalRepository } from '@data/recovery-situational-store';

const createStore = (): SituationalRepository => createSituationalStore();

export const useSituationalCommandCenter = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<readonly SituationalAssessment[]>([]);
  const [plans, setPlans] = useState<readonly RecoveryPlanCandidate[]>([]);
  const [pulses, setPulses] = useState<readonly TelemetryPulse[]>([]);

  const repository = useMemo(() => createStore(), []);

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await repository.listAssessments({ workloadNodeIds: [], onlyActive: true });
      const loaded = stored.map((entry) => entry.assessment);
      setAssessments(loaded);
      if (loaded[0]?.workload.nodeId) {
        const next = await refreshTelemetryPulse(loaded[0].workload.nodeId);
        setPulses(next);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'failed to hydrate situational workspace');
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const runSingle = useCallback(async (request: OrchestrateRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response: OrchestrateResponse = await executeCommandCenter(request);
      setAssessments((current) => [...current, response.assessment]);
      setPlans((current) => [...current, response.assessment.plan]);
      return response;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'batch execution failed';
      setError(message);
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  const runBatch = useCallback(async (requests: readonly OrchestrateRequest[]) => {
    setLoading(true);
    setError(null);
    try {
      const { responses } = await executeCommandCenterBatch(requests);
      setAssessments((current) => [...current, ...responses.map((response) => response.assessment)]);
      setPlans((current) => [...current, ...responses.map((response) => response.assessment.plan)]);
      return responses;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'batch execution failed');
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveAssessment = useCallback(async (assessmentId: string) => {
    await finalizeCommandCenter(assessmentId);
    setAssessments((current) => current.filter((assessment) => assessment.assessmentId !== assessmentId));
  }, []);

  const loadNodePlans = useCallback(async (nodeId: string) => {
    const nodePlans = await repository.listPlans(nodeId);
    setPlans(nodePlans);
    return nodePlans;
  }, [repository]);

  return {
    loading,
    error,
    assessments,
    plans,
    pulses,
    hydrate,
    runSingle,
    runBatch,
    resolveAssessment,
    loadNodePlans,
  };
};
