import { withBrand, type Brand } from '@shared/core';
import type { SurfaceProfile, SurfaceCommand, SurfaceSchedule, SurfaceState, SurfaceWindow, SurfaceWindow as _SurfaceWindow } from './types';
import type { DrillRunSnapshot } from '@domain/recovery-drill-lab';
import { buildSurfaceSchedule } from './planner';

type WorkspaceId = Brand<string, 'DrillWorkspaceId'>;

const toWorkspaceId = (value: string): WorkspaceId => withBrand(value, 'DrillWorkspaceId');
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const toWindowKey = (window: _SurfaceWindow): string => `${window.profile.tenant}:${window.from}`;

export class SurfaceScheduler {
  private readonly queue: Array<{ readonly command: SurfaceCommand; readonly schedule: SurfaceSchedule }> = [];
  private readonly windows = new Map<string, SurfaceWindow>();
  private readonly seenRuns = new Map<WorkspaceId, string[]>();
  private state: SurfaceState = {
    commandQueue: [],
    completedCount: 0,
    failedCount: 0,
  };

  public planCommands(profile: SurfaceProfile, commands: readonly SurfaceCommand[], windows: readonly SurfaceWindow[]): SurfaceSchedule[] {
    const planned: SurfaceSchedule[] = [];
    const profileWindow = this.selectWindow(profile, windows);

    for (const [index, command] of commands.entries()) {
      const workspaceSeed = {
        id: command.workspaceId,
        scenarioIds: [command.scenarioId],
        name: `${profile.tenant}-surface`,
        description: `Surface workspace for ${command.workspaceId}`,
        metadata: {
          tenant: profile.tenant,
          environment: profile.environment,
          ownerTeam: command.requestedBy,
          createdBy: command.requestedBy,
          tags: [...profileWindow.tags, command.type],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const schedule = buildSurfaceSchedule(command, workspaceSeed as never, command.scenarioId, clamp(profileWindow.profile.preferredPriority === 'critical' ? 100 : 60, 1, 180));
      const withOffset: SurfaceSchedule = {
        ...schedule,
        workspace: workspaceSeed as never,
        startedAt: new Date(Date.now() + index * 5000).toISOString(),
      };

      this.queue.push({ command, schedule: withOffset });
      this.windows.set(toWindowKey(profileWindow), profileWindow);
      this.state = {
        ...this.state,
        commandQueue: [...this.state.commandQueue, command],
      };

      const runIds = this.seenRuns.get(command.workspaceId as WorkspaceId) ?? [];
      this.seenRuns.set(command.workspaceId as WorkspaceId, [...runIds, withBrand(command.commandId, 'DrillLabRunId')]);
      planned.push(withOffset);
    }

    return planned;
  }

  public markCompleted(snapshot: DrillRunSnapshot, success: boolean): void {
    if (success) {
      this.state = {
        ...this.state,
        completedCount: this.state.completedCount + 1,
      };
      return;
    }

    this.state = {
      ...this.state,
      failedCount: this.state.failedCount + 1,
    };
  }

  public dequeueByWorkspace(workspaceId: string): readonly SurfaceSchedule[] {
    const filtered: SurfaceSchedule[] = [];
    const target = toWorkspaceId(workspaceId);
    for (let index = this.queue.length - 1; index >= 0; index--) {
      const current = this.queue[index];
      if (current.command.workspaceId !== target) {
        continue;
      }
      filtered.push(current.schedule);
      this.queue.splice(index, 1);
    }
    return filtered;
  }

  public get stateSnapshot(): SurfaceState {
    return {
      ...this.state,
      commandQueue: [...this.state.commandQueue],
    };
  }

  public get windowKeys(): readonly string[] {
    return [...this.windows.keys()];
  }

  public runsForWorkspace(workspaceId: string): readonly string[] {
    const target = toWorkspaceId(workspaceId);
    return this.seenRuns.get(target) ?? [];
  }

  public filterRunsByStatus(runs: readonly DrillRunSnapshot[], statuses: readonly string[]): readonly DrillRunSnapshot[] {
    if (statuses.length === 0) {
      return runs;
    }

    return runs.filter((run) => statuses.includes(run.status));
  }

  public reset(): void {
    this.queue.length = 0;
    this.windows.clear();
    this.seenRuns.clear();
    this.state = {
      commandQueue: [],
      completedCount: 0,
      failedCount: 0,
    };
  }

  private selectWindow(profile: SurfaceProfile, windows: readonly SurfaceWindow[]): SurfaceWindow {
    const found = windows.find((window) => window.profile.tenant === profile.tenant);
    if (found) {
      return found;
    }

    return {
      id: `${profile.tenant}-auto-${profile.zone}`,
      profile,
      from: new Date().toISOString(),
      to: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      tags: ['auto', profile.tenant, profile.zone],
    };
  }
}

export const buildMinuteWindow = (start: string, minutes: number): SurfaceWindow => {
  const from = new Date(start);
  const safeMinutes = Number.isFinite(minutes) ? Math.max(1, Math.min(360, Math.floor(minutes))) : 30;
  return {
    id: `window-${from.toISOString()}`,
    profile: {
      tenant: 'default',
      zone: 'global',
      environment: 'staging',
      maxConcurrentRuns: 1,
      preferredPriority: 'medium',
    },
    from: from.toISOString(),
    to: new Date(from.getTime() + safeMinutes * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    tags: ['surface', 'synth'],
  };
};

export const createScheduler = (): SurfaceScheduler => new SurfaceScheduler();
