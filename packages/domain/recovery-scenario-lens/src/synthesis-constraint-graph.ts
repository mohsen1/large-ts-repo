import type { NoInfer } from '@shared/type-level';
import {
  asMillis,
  type ConstraintViolation,
  type ScenarioCommand,
  type ScenarioConstraint,
  type ScenarioPlan,
} from './types';

import { mergeConstraintSets } from './graph';

const asConstraintKey = (type: ScenarioConstraint['type']): `constraint:${ScenarioConstraint['type']}` =>
  `constraint:${type}` as `constraint:${ScenarioConstraint['type']}`;

type ConstraintType = ScenarioConstraint['type'];
export type ConstraintBucket = {
  readonly byType: { [K in ConstraintType as `constraint:${K}`]: readonly ScenarioConstraint[] };
};

export interface ConstraintWindow<TInput extends readonly ScenarioCommand[]> {
  readonly id: `window:${number}`;
  readonly label: `w:${number}`;
  readonly commandIds: {
    [K in keyof TInput]: TInput[K] extends ScenarioCommand ? TInput[K]['commandId'] : never;
  };
}

export interface ConstraintEnvelope<TConstraint extends ScenarioConstraint = ScenarioConstraint> {
  readonly constraints: readonly TConstraint[];
  readonly generatedAt: string;
  readonly signature: `sig:${string}`;
}

export interface ConstraintBudget {
  readonly maxParallelism: number;
  readonly maxBlast: number;
  readonly maxRuntimeMs: number;
}

export const isParallelism = (constraint: ScenarioConstraint): boolean =>
  constraint.type === 'max_parallelism';

export const isBlastBound = (constraint: ScenarioConstraint): boolean =>
  constraint.type === 'max_blast' || constraint.type === 'region_gate';

const asSignature = (scenarioId: string, run: string): `sig:${string}` =>
  `sig.${scenarioId}.${run}` as `sig:${string}`;

const windowId = (index: number): `window:${number}` => `window:${index}`;
const windowLabel = (index: number): `w:${number}` => `w:${index}`;

export class ConstraintGraph<TCommands extends readonly ScenarioCommand[]> {
  readonly #commands = new Map<string, ScenarioCommand>();
  readonly #constraints = new Map<ScenarioConstraint['constraintId'], ScenarioConstraint>();
  readonly #commandConstraints = new Map<string, Set<ScenarioConstraint['constraintId']>>();

  constructor(commands: NoInfer<TCommands>, constraints: readonly ScenarioConstraint[]) {
    for (const command of commands) {
      this.#commands.set(command.commandId, command);
      this.#commandConstraints.set(command.commandId, new Set());
    }
    this.ingest(constraints);
  }

  ingest(constraints: readonly ScenarioConstraint[]): void {
    for (const constraint of constraints) {
      this.#constraints.set(constraint.constraintId, constraint);
      for (const commandId of constraint.commandIds) {
        const commandConstraints = this.#commandConstraints.get(commandId);
        if (commandConstraints) {
          commandConstraints.add(constraint.constraintId);
        }
      }
    }
  }

  get constraints(): ConstraintEnvelope<ScenarioConstraint> {
    return {
      constraints: [...this.#constraints.values()],
      generatedAt: new Date().toISOString(),
      signature: asSignature('constraints.graph', String(this.#constraints.size)),
    };
  }

  getBucketed(): ConstraintBucket {
    const byType: ConstraintBucket['byType'] = {
      'constraint:max_parallelism': [],
      'constraint:max_blast': [],
      'constraint:must_complete_before': [],
      'constraint:region_gate': [],
    };

    for (const constraint of this.#constraints.values()) {
      const key = asConstraintKey(constraint.type);
      byType[key] = [...byType[key], constraint];
    }

    return { byType };
  }

  commandConstraintIds(commandId: string): readonly ScenarioConstraint['constraintId'][] {
    const constraints = this.#commandConstraints.get(commandId);
    if (!constraints) {
      return [];
    }

    return [...constraints];
  }

  activeViolations(candidateCommandIds: readonly string[]): readonly ConstraintViolation[] {
    const commandSet = new Set(candidateCommandIds);
    const all = [...this.#constraints.values()];
    const parallelism = all.find(isParallelism);
    const violations: ConstraintViolation[] = [];

    for (const constraint of all) {
      const affected = constraint.commandIds.filter((id) => commandSet.has(id));
      if (affected.length === 0) {
        continue;
      }

      if (constraint.type === 'max_parallelism') {
        const observed = candidateCommandIds.length;
        if (observed > constraint.limit) {
          violations.push({
            ...constraint,
            commandId: affected[0] as ScenarioConstraint['commandIds'][number],
            observed,
          });
        }
        continue;
      }

      if (constraint.type === 'max_blast' && parallelism) {
        const observed = affected.reduce((acc, id) => acc + (this.#commands.get(id)?.blastRadius ?? 0), 0);
        if (observed > constraint.limit) {
          violations.push({
            ...constraint,
            commandId: affected[0] as ScenarioConstraint['commandIds'][number],
            observed,
          });
        }
      }

      if (constraint.type === 'must_complete_before') {
        const orderPositions = affected.map((id) => candidateCommandIds.indexOf(id)).filter((position) => position >= 0);
        if (orderPositions.length > 0) {
          const sorted = [...orderPositions].sort((left, right) => left - right);
          if (sorted[0] !== 0 && sorted.length > 1 && sorted[0] >= 1 && sorted[1] !== 0) {
            violations.push({
              ...constraint,
              commandId: affected[0] as ScenarioConstraint['commandIds'][number],
              observed: sorted[sorted.length - 1] - sorted[0],
            });
          }
        }
      }

      if (constraint.type === 'region_gate' && affected.length > 1) {
        violations.push({
          ...constraint,
          commandId: affected[0] as ScenarioConstraint['commandIds'][number],
          observed: affected.length,
        });
      }
    }

    return violations;
  }

  toWindows(): readonly ConstraintWindow<TCommands>[] {
    const windows: ConstraintWindow<TCommands>[] = [];
    let index = 0;

    for (const constraint of this.#constraints.values()) {
      const constraintCommandIds = [...constraint.commandIds];
      const commandIds = constraintCommandIds as {
        [K in keyof TCommands]: TCommands[K] extends ScenarioCommand ? TCommands[K]['commandId'] : never;
      };

      windows.push({
        id: windowId(index),
        label: windowLabel(index),
        commandIds,
      });
      index += 1;
    }

    return windows;
  }

  estimateBudget(plan: ScenarioPlan): ConstraintBudget {
    const commandIds = new Set(plan.commandIds);
    let blastBudget = 0;
    for (const commandId of commandIds) {
      blastBudget = Math.max(blastBudget, this.#commands.get(commandId)?.blastRadius ?? 0);
    }

    const bucket = this.getBucketed().byType as unknown as Record<`constraint:${ConstraintType}`, readonly ScenarioConstraint[]>;
    const parallelConstraints = bucket['constraint:max_parallelism'];
    const runtimeConstraints = bucket['constraint:must_complete_before'];
    const parallelBudget = Math.max(1, parallelConstraints[0]?.limit ?? plan.commandIds.length);
    let runtimeBudget = 0;
    for (const constraint of runtimeConstraints) {
      runtimeBudget += constraint.limit;
    }

    return {
      maxParallelism: parallelBudget,
      maxBlast: blastBudget,
      maxRuntimeMs: asMillis(runtimeBudget),
    };
  }

  toMergedConstraints(other: readonly ScenarioConstraint[]): ConstraintEnvelope {
    return {
      constraints: mergeConstraintSets(Array.from(this.#constraints.values()), other),
      generatedAt: new Date().toISOString(),
      signature: asSignature('constraints.merged', String(this.#constraints.size + other.length)),
    } as ConstraintEnvelope<ScenarioConstraint>;
  }
}

export const mergeConstraintBuckets = (
  left: ConstraintBucket,
  right: ConstraintBucket,
): ConstraintBucket =>
  ({
    byType: {
      'constraint:max_parallelism': [...left.byType['constraint:max_parallelism'], ...right.byType['constraint:max_parallelism']],
      'constraint:max_blast': [...left.byType['constraint:max_blast'], ...right.byType['constraint:max_blast']],
      'constraint:must_complete_before': [
        ...left.byType['constraint:must_complete_before'],
        ...right.byType['constraint:must_complete_before'],
      ],
      'constraint:region_gate': [...left.byType['constraint:region_gate'], ...right.byType['constraint:region_gate']],
    },
  }) as ConstraintBucket;

export const summarizeConstraintGraph = <TCommands extends readonly ScenarioCommand[]>(
  commands: NoInfer<TCommands>,
  constraints: readonly ScenarioConstraint[],
): {
  readonly bucket: ConstraintBucket;
  readonly windows: readonly ConstraintWindow<TCommands>[];
} => {
  const graph = new ConstraintGraph(commands, constraints);
  const bucket = graph.getBucketed();
  const windows = graph.toWindows();
  return { bucket, windows };
};
