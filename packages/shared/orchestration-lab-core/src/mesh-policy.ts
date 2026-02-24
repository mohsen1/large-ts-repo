import { z } from 'zod';
import type {
  MeshLane,
  MeshMode,
} from './mesh-types';

export type PolicyWeight = number & { readonly __brand: 'PolicyWeight' };
export type PolicyEnvelope<TRoute extends string> = {
  readonly route: `policy:${TRoute}`;
  readonly revision: `${number}`;
};

export type PolicyRuleId = `policy:${string}:${number}`;
export type PolicyCondition<TValue> = TValue extends string
  ? `${TValue}:${'must' | 'should' | 'avoid'}`
  : TValue extends number
    ? `${TValue}:${'min' | 'max' | 'target'}`
    : `${string}`;

export type PolicyMatrix<TPolicies extends readonly string[]> = {
  [K in TPolicies[number]]: {
    readonly allowed: boolean;
    readonly threshold: number;
  };
};

export const PolicyWeightSchema = z.number().min(0).max(1);

export interface MeshPolicyMetadata {
  readonly id: PolicyRuleId;
  readonly lane: MeshLane;
  readonly mode: MeshMode;
  readonly title: string;
  readonly rationale: string;
  readonly tags: readonly string[];
}

export interface MeshPolicyInput {
  readonly tenantId: string;
  readonly stage: string;
  readonly signals: readonly {
    readonly id: string;
    readonly score: number;
  }[];
}

export interface MeshPolicyOutput {
  readonly score: number;
  readonly approved: boolean;
  readonly tags: readonly string[];
  readonly route: string;
}

type PolicyScoreInput = {
  readonly score: number;
  readonly threshold: number;
};

const normalizePolicyWeight = (value: number): PolicyWeight =>
  Math.max(0, Math.min(1, Number(value.toFixed(6)))) as PolicyWeight;

const clampScore = (value: number): number => Math.max(0, Math.min(1, value));

const inferSeverityTag = <TPolicy extends MeshPolicyMetadata>(policy: TPolicy): `severity:${TPolicy['lane']}` =>
  `severity:${policy.lane}` as const;

export const buildPolicyRoute = <TRoute extends string>(lane: MeshLane, mode: MeshMode, route: TRoute): `mesh/${TRoute}` => {
  const normalizedRoute = `${lane}/${mode}/${route}`.replace(/\/{2,}/g, '/');
  return `mesh/${normalizedRoute}` as `mesh/${TRoute}`;
};

const buildPolicyTag = (index: number, seed: string): string => `policy:${seed}:${index}`;
const scoreFromSignal = ({ score, threshold }: PolicyScoreInput): boolean => clampScore(score) >= clampScore(threshold);

export const toPolicyScore = (input: PolicyScoreInput): PolicyRuleId => {
  const passed = scoreFromSignal(input);
  return `policy:${passed ? 'pass' : 'reject'}:${input.threshold}` as PolicyRuleId;
};

export class MeshPolicyCatalog<TName extends string> {
  readonly #name: TName;
  readonly #entries = new Map<PolicyRuleId, MeshPolicyMetadata>();
  readonly #weights = new Map<PolicyRuleId, PolicyWeight>();

  constructor(name: TName) {
    this.#name = name;
  }

  public get name(): TName {
    return this.#name;
  }

  public register<TLane extends MeshLane>(
    lane: TLane,
    mode: MeshMode,
    title: string,
    score: number,
  ): PolicyRuleId {
    const id = `policy:${this.#name}:${this.#entries.size + 1}` as PolicyRuleId;
    const metadata: MeshPolicyMetadata = {
      id,
      lane,
      mode,
      title,
      rationale: `catalog:${title.toLowerCase().replace(/\\s+/g, '-')}`,
      tags: [
        `lane:${lane}`,
        `mode:${mode}`,
        inferSeverityTag({ id, lane, mode, title, rationale: '', tags: [] }),
      ],
    };
    this.#entries.set(id, metadata);
    this.#weights.set(id, normalizePolicyWeight(score));
    return id;
  }

  public entries(): readonly MeshPolicyMetadata[] {
    return [...this.#entries.values()];
  }

  public has(id: PolicyRuleId): boolean {
    return this.#entries.has(id);
  }

  public score<TPolicy extends readonly PolicyRuleId[]>(
    candidate: TPolicy,
    input: Readonly<{ score: number }>,
  ): { readonly [K in TPolicy[number]]: PolicyWeight } {
    const output = Object.fromEntries(
      candidate.map((id) => {
        const matched = this.#weights.get(id) ?? 0;
        const ratio = normalizePolicyWeight(input.score * matched);
        return [id, ratio] as const;
      }),
    ) as { [K in TPolicy[number]]: PolicyWeight };
    return output;
  }

  public [Symbol.dispose](): void {
    this.#entries.clear();
    this.#weights.clear();
  }

  public [Symbol.asyncDispose](): Promise<void> {
    this[Symbol.dispose]();
    return Promise.resolve();
  }
}

export const policyFingerprint = (policy: MeshPolicyMetadata): string =>
  `${policy.id}#${policy.lane}:${policy.mode}:${policy.tags.length}`;

export const evaluatePolicy = (
  input: MeshPolicyInput,
  policies: readonly MeshPolicyMetadata[],
): MeshPolicyOutput => {
  const score = normalizePolicyWeight(
    input.signals.reduce((acc, item) => {
      const safeScore = Number.isFinite(item.score) ? item.score : 0;
      return acc + clampScore(safeScore);
    }, 0) / Math.max(1, input.signals.length),
  );
  const tags = policies.map((policy) => policy.id);
  const approved = score > 0.5;
  const route = approved ? buildPolicyRoute(input.stage as MeshLane, 'discovery', 'approve') : buildPolicyRoute(input.stage as MeshLane, 'discovery', 'reject');
  return {
    score,
    approved,
    tags,
    route,
  };
};
