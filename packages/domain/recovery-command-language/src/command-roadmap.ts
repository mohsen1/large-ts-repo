import { z } from 'zod';
import type { CommandDirective } from './command-directive';

export interface RoadmapCheckpoint {
  name: string;
  plannedAt: string;
  dependencies: string[];
  completed: boolean;
}

export interface CommandRoadmap {
  intentId: string;
  namespace: string;
  checkpoints: RoadmapCheckpoint[];
  directives: CommandDirective[];
  riskNotes: string[];
}

const roadmapCheckpointSchema = z.object({
  name: z.string().min(3),
  plannedAt: z.string().datetime(),
  dependencies: z.array(z.string()),
  completed: z.boolean(),
});

const roadmapSchema = z.object({
  intentId: z.string().uuid(),
  namespace: z.string().min(1),
  checkpoints: z.array(roadmapCheckpointSchema),
  directives: z.array(z.record(z.unknown())),
  riskNotes: z.array(z.string()),
});

export type CommandRoadmapInput = z.input<typeof roadmapSchema>;

export function normalizeRoadmap(raw: CommandRoadmapInput): CommandRoadmap {
  return {
    intentId: raw.intentId,
    namespace: raw.namespace,
    checkpoints: raw.checkpoints,
    directives: raw.directives as unknown as CommandDirective[],
    riskNotes: raw.riskNotes,
  };
}

export function appendCheckpoint(
  roadmap: CommandRoadmap,
  checkpoint: RoadmapCheckpoint,
): CommandRoadmap {
  return {
    ...roadmap,
    checkpoints: [...roadmap.checkpoints, checkpoint],
  };
}

export function markCompletedIfPossible(roadmap: CommandRoadmap): CommandRoadmap {
  return {
    ...roadmap,
    checkpoints: roadmap.checkpoints.map((checkpoint, index) => {
      if (checkpoint.completed) {
        return checkpoint;
      }
      const shouldComplete = index === 0 || roadmap.checkpoints[index - 1].completed;
      return {
        ...checkpoint,
        completed: shouldComplete && checkpoint.plannedAt < new Date().toISOString(),
      };
    }),
  };
}
