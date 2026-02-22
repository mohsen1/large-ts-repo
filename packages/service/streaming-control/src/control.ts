import { scale, StreamPlan } from '@domain/streaming-engine/planner';

export interface Command {
  type: 'start' | 'pause' | 'resume' | 'stop';
  stream: string;
}

export interface CommandResult {
  accepted: boolean;
  message: string;
}

export function runCommand(cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'start':
      return { accepted: true, message: `starting ${cmd.stream}` };
    case 'pause':
      return { accepted: true, message: `pausing ${cmd.stream}` };
    case 'resume':
      return { accepted: true, message: `resuming ${cmd.stream}` };
    default:
      return { accepted: true, message: `stopped ${cmd.stream}` };
  }
}

export function tune(plan: StreamPlan, factor: number): StreamPlan {
  return scale(plan, factor);
}
