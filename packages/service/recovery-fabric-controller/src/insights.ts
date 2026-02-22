import type { FabricManifest, FabricPlan, FabricPolicy, FabricRun } from '@domain/recovery-fabric-orchestration';
import { analyzePlan, summarizeRun } from '@domain/recovery-fabric-orchestration';

export interface CommandRunMetrics {
  readonly runId: FabricRun['id'];
  readonly readiness: number;
  readonly risk: number;
  readonly commandCount: number;
  readonly timelineMinutes: number;
  readonly status: FabricRun['status'];
}

const readinessGrade = (band: FabricRun['readinessBand']): number => {
  switch (band) {
    case 'cold':
      return 20;
    case 'warm':
      return 40;
    case 'hot':
      return 70;
    case 'critical':
      return 95;
    default:
      return 50;
  }
};

const riskGrade = (band: FabricRun['riskBand']): number => {
  switch (band) {
    case 'green':
      return 10;
    case 'amber':
      return 35;
    case 'red':
      return 70;
    case 'black':
      return 100;
    default:
      return 45;
  }
};

export const buildRunMetrics = (run: FabricRun): CommandRunMetrics => {
  return {
    runId: run.id,
    readiness: readinessGrade(run.readinessBand),
    risk: riskGrade(run.riskBand),
    commandCount: run.commandIds.length,
    timelineMinutes: run.windows.reduce((acc, window) => acc + (Date.parse(window.endsAt) - Date.parse(window.startsAt)) / 60000, 0),
    status: run.status,
  };
};

export const computeRunHealth = (runs: readonly FabricRun[]): number => {
  if (runs.length === 0) {
    return 100;
  }

  let healthy = 0;
  for (const run of runs) {
    const metrics = buildRunMetrics(run);
    healthy += metrics.readiness - metrics.risk;
  }
  return Math.max(0, Math.min(100, Math.round((healthy / (runs.length * 100)) * 120)));
};

const selectedCommandIds = (
  selectedCommandMap: Map<FabricPlan['commands'][number]['id'], FabricPlan['commands'][number]>,
): readonly FabricRun['commandIds'][number][] => {
  return [...selectedCommandMap.keys()];
};

export const summarizeCommandPlan = (
  plan: FabricPlan,
  policy: FabricPolicy,
  selectedCommandMap: Map<FabricPlan['commands'][number]['id'], FabricPlan['commands'][number]>,
): ReturnType<typeof summarizeRun> => {
  const commandIds = selectedCommandIds(selectedCommandMap);
  const syntheticRun: FabricRun = {
    id: (`summary-${Date.now()}`) as never,
    tenantId: plan.tenantId,
    fabricId: plan.fabricId,
    policyId: plan.policyId,
    incidentId: plan.commands[0]?.incidentId ?? (plan.policyId as never),
    commandIds,
    startedAt: new Date().toISOString(),
    status: 'queued',
    readinessBand: 'warm',
    riskBand: 'amber',
    windows: [],
  };

  return summarizeRun(syntheticRun, policy);
};

export const inspectManifest = (manifest: FabricManifest): string[] => {
  const diagnostics: string[] = [];
  if (manifest.snapshots.length === 0) {
    diagnostics.push('manifest has no snapshots');
  }
  if (manifest.run && manifest.run.status === 'failed') {
    diagnostics.push('manifest run has failed');
  }
  if (manifest.policy.windowHours.max > 20) {
    diagnostics.push('policy window is unusually large');
  }
  return diagnostics;
};

export const buildOperationDigest = async (
  manifest: FabricManifest,
  _store: unknown,
): Promise<string> => {
  const run = manifest.run;
  if (!run) {
    return JSON.stringify({
      policyId: manifest.policy.id,
      commandCount: manifest.plan.commands.length,
      warnings: inspectManifest(manifest),
      sourceProgram: manifest.sourceProgram.name,
    });
  }

  const report = buildRunMetrics(run);
  const policyMap = new Map(manifest.plan.commands.map((command) => [command.id, command]));
  const metrics = analyzePlan(manifest.policy, policyMap, manifest.plan);

  const digest = {
    policyName: manifest.policy.name,
    commandCount: manifest.plan.commands.length,
    runId: run.id,
    readiness: report.readiness,
    risk: report.risk,
    timelineMinutes: report.timelineMinutes,
    reportStatus: computeRunHealth([run]),
    windows: run.windows,
    metrics,
    snapshotCount: manifest.snapshots.length,
  };

  return JSON.stringify(digest, null, 2);
};
