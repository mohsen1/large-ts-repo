import { z } from 'zod';
import {
  ConvergenceBlueprint,
  ConvergenceConstraint,
  ConvergenceDomain,
  ConvergenceStage,
  ConvergenceTemplateName,
  ConvergenceTag,
  TemplateVersion,
  normalizeConvergenceTag,
  normalizeTemplateName,
} from './types';
import { normalizeBlueprintStages } from './types';
import type { NoInfer } from '@shared/type-level';

export const blueprintConstraintSchema = z.object({
  code: z.string().min(3).max(120),
  scope: z.enum(['fabric', 'signal', 'policy', 'runtime', 'control']),
  required: z.boolean(),
  weight: z.number().min(0).max(1),
});

export const blueprintSchema = z.object({
  id: z.string().transform((value) => value as ConvergenceTemplateName),
  version: z.string().regex(/^\d+\.\d+\.\d+$/) as z.ZodType<TemplateVersion>,
  domain: z.enum(['fabric', 'signal', 'policy', 'runtime', 'control']) as z.ZodType<ConvergenceDomain>,
  labels: z.array(z.string().min(1)).default([]).optional(),
  stages: z.array(z.enum(['discover', 'evaluate', 'simulate', 'execute', 'close']) as z.ZodType<ConvergenceStage>),
  constraints: z.array(blueprintConstraintSchema),
});

type ConstraintCode = ConvergenceConstraint['code'];

const normalizeConstraintCode = (value: string): ConstraintCode => value as ConstraintCode;
const labelFromScope = (scope: ConvergenceDomain): `scope:${ConvergenceDomain}` => `scope:${scope}`;

export type ConvergenceBlueprintInput = z.input<typeof blueprintSchema>;
export type ConvergenceBlueprintOutput = ConvergenceBlueprint;

export interface BlueprintRegistryEntry {
  readonly blueprint: ConvergenceBlueprint;
  readonly labelMap: ReadonlyMap<string, ConvergenceConstraint[]>;
  readonly staged: readonly ConvergenceStage[];
}

export const parseBlueprintPayload = (payload: ConvergenceBlueprintInput | ConvergenceBlueprint): ConvergenceBlueprint => {
  const result = blueprintSchema.parse(payload as ConvergenceBlueprintInput);
  const stageSet = normalizeBlueprintStages(result.stages);
  const normalizedLabels = (result.labels ?? []).map((label) => normalizeConvergenceTag(label));
  const normalizedConstraints = result.constraints.map((constraint) => ({
    ...constraint,
    code: normalizeConstraintCode(constraint.code),
  }));
  return {
    id: normalizeTemplateName(result.id),
    version: result.version,
    domain: result.domain,
    labels: normalizedLabels,
    stages: stageSet,
    constraints: normalizedConstraints,
  };
};

const dedupeConstraints = (constraints: readonly ConvergenceConstraint[]): ConvergenceConstraint[] => {
  const grouped = new Map<string, ConvergenceConstraint>();
  for (const constraint of constraints) {
    const key = `${constraint.scope}:${constraint.code}`;
    const existing = grouped.get(key);
    if (!existing || constraint.weight > existing.weight) {
      grouped.set(key, constraint);
    }
  }
  return [...grouped.values()];
};

export const buildBlueprintRegistry = <TEntries extends readonly ConvergenceBlueprintOutput[]>(
  entries: NoInfer<TEntries>,
): ReadonlyMap<string, BlueprintRegistryEntry> => {
  const registry = new Map<string, BlueprintRegistryEntry>();
  for (const entry of entries) {
    const parsed = parseBlueprintPayload(entry);
    const constraints = dedupeConstraints(parsed.constraints);
    const id = parsed.id;
    const constraintLabelMap = new Map<string, ConvergenceConstraint[]>(
      constraints.map((constraint) => [constraint.code as string, [constraint]]),
    );

    registry.set(id, {
      blueprint: parsed,
      labelMap: new Map<string, ConvergenceConstraint[]>(
        [
          [labelFromScope(parsed.domain), constraints],
          [parsed.id as string, constraints],
          ...constraintLabelMap.entries(),
        ],
      ),
      staged: parsed.stages,
    });
  }
  return registry;
};

export const isDomainStage = (value: string): value is ConvergenceStage => {
  return ['discover', 'evaluate', 'simulate', 'execute', 'close'].includes(value);
};

export const resolveBlueprintById = (
  registry: ReadonlyMap<string, BlueprintRegistryEntry>,
  id: ConvergenceTemplateName,
): ConvergenceBlueprint | null => {
  const entry = registry.get(id);
  if (!entry) {
    return null;
  }
  if (entry.blueprint.labels.length === 0) {
    return {
      ...entry.blueprint,
      labels: [normalizeConvergenceTag('default')],
    };
  }
  return entry.blueprint;
};

export const sortBlueprints = <TBlueprints extends readonly ConvergenceBlueprint[]>(
  blueprints: TBlueprints,
): TBlueprints => {
  const sorted = [...blueprints].toSorted((left, right) => {
    return left.version.localeCompare(right.version) || left.domain.localeCompare(right.domain);
  });
  return sorted as unknown as TBlueprints;
};
