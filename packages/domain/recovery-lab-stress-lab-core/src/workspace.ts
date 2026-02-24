import { makeTemporalWindow, withAsyncDisposableScope } from '@shared/orchestration-lab-core';
import { createOrchestrator, runChaosLab } from './orchestrator';
import { buildPlanInput, planTemplates } from './plan';
import type { LabMode, LabPlanOutput, WorkspaceFingerprint } from './types';
import { workspaceFingerprint } from './types';

export interface WorkspaceSeed {
  readonly tenant: string;
  readonly mode: LabMode;
}

export interface WorkspaceState {
  readonly tenant: string;
  readonly mode: LabMode;
  readonly fingerprint: WorkspaceFingerprint;
  readonly window: readonly [string, string];
  readonly plugins: readonly string[];
  readonly lastSummary: string;
  readonly lastOutput?: LabPlanOutput;
  readonly timestamp: string;
}

interface WorkspaceRecord {
  [tenant: string]: { [mode: string]: WorkspaceState };
}

const sessions: WorkspaceRecord = {};

export const buildWorkspaceWindow = (tenant: string, mode: LabMode): readonly [string, string] => {
  const window = makeTemporalWindow(new Date(), mode === 'chaos' ? 120 : mode === 'synthesis' ? 180 : 300);
  return [window.from, window.to];
}

export const hydrateWorkspace = (seed: WorkspaceSeed): WorkspaceState => {
  const existing = sessions[seed.tenant]?.[seed.mode];
  if (existing) {
    return existing;
  }
  const created: WorkspaceState = {
    tenant: seed.tenant,
    mode: seed.mode,
    fingerprint: workspaceFingerprint(seed.tenant, seed.mode),
    window: buildWorkspaceWindow(seed.tenant, seed.mode),
    plugins: [
      `plugin:${seed.mode}-discover`,
      `plugin:${seed.mode}-validate`,
      `plugin:${seed.mode}-execute`,
      `plugin:${seed.mode}-rollback`,
    ],
    lastSummary: 'never-run',
    timestamp: new Date().toISOString(),
  };
  sessions[seed.tenant] = { ...sessions[seed.tenant], [seed.mode]: created };
  return created;
};

export const updateWorkspace = (seed: WorkspaceSeed, state: Partial<WorkspaceState>): WorkspaceState => {
  const current = hydrateWorkspace(seed);
  const next: WorkspaceState = {
    ...current,
    ...state,
    timestamp: new Date().toISOString(),
  };
  sessions[seed.tenant] = { ...sessions[seed.tenant], [seed.mode]: next };
  return next;
};

export const renderWorkspaceSummary = (state: Pick<WorkspaceState, 'tenant' | 'mode' | 'plugins' | 'lastSummary'>): string =>
  `${state.tenant}:${state.mode}:plugins=${state.plugins.length}:last=${state.lastSummary}`;

export const runWorkspace = async (seed: WorkspaceSeed): Promise<string> => {
  const orchestrator = createOrchestrator(seed.tenant, seed.mode);
  const template = planTemplates(seed.tenant).find((item) => item.mode === seed.mode);
  if (!template) {
    return 'template-not-found';
  }
  const plan = buildPlanInput(template);

  return withAsyncDisposableScope(async () => {
    const result = await orchestrator.execute(plan);
    const next = updateWorkspace(seed, {
      lastSummary: result.summary,
      lastOutput: result.output,
      plugins: result.timeline.map((step) => step.plugin),
      timestamp: new Date().toISOString(),
    });
    return renderWorkspaceSummary(next);
  });
};

export const runAllModes = async (tenant: string): Promise<readonly string[]> => {
  const modes: readonly LabMode[] = ['chaos', 'synthesis', 'continuity'];
  const output: string[] = [];
  for (const mode of modes) {
    await Promise.resolve();
    const summary = await runChaosLab(tenant, mode).then((result) => `${tenant}:${mode}:${result.summary}`);
    output.push(summary);
  }
  return output;
};
