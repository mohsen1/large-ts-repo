import { CandidateContext, CandidateSource, Item, Recommendation, Similarity, RecommendationPlan, CandidatePool } from './model';

export class PopularitySimilarity implements Similarity {
  constructor(private readonly weight = 0.5) {}

  score(a: Item, b: Item): number {
    const age = Math.max(1, Math.abs(a.createdAt.getTime() - b.createdAt.getTime()) / 1000);
    const overlap = a.tags.filter((tag) => b.tags.includes(tag)).length;
    const denom = 1 + age;
    return (overlap * this.weight) / denom + (a.score + b.score) / 200;
  }
}

export class TagSimilarity implements Similarity {
  score(a: Item, b: Item): number {
    if (a.tags.length === 0 || b.tags.length === 0) return 0;
    const inter = a.tags.filter((tag) => b.tags.includes(tag)).length;
    return inter / Math.max(a.tags.length, b.tags.length);
  }
}

export class CompositeSimilarity {
  constructor(private readonly sims: readonly Similarity[]) {}
  score(a: Item, b: Item): number {
    if (this.sims.length === 0) return 0;
    return this.sims.reduce((acc, sim) => acc + sim.score(a, b), 0) / this.sims.length;
  }
}

export async function recommend<T extends Item>(
  sources: readonly CandidateSource<T>[],
  context: CandidateContext,
  plan: RecommendationPlan,
): Promise<readonly Recommendation<T>[]> {
  const all = await collect<T>(sources, context);
  const scored = all.map((item, index) => {
    const localScore = all.reduce((acc, other) => acc + hybridScore(item, other), 0);
    const reasons = reason(item, index, plan);
    const dampened = localScore / (index + 1) * plan.dampening;
    const score = Math.max(0, dampened + plan.boostNew * newness(item.createdAt));
    return {
      itemId: item.id,
      score,
      reasons,
      rank: 0,
      payload: item,
    };
  });

  const ranked = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, plan.topK)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  return ranked;
}

function reason(item: Item, position: number, plan: RecommendationPlan): string[] {
  const reasons = ['position', `seed:${plan.seed}`];
  if (position < 3) reasons.push('high-priority');
  if (item.score > 0.7) reasons.push('strong-match');
  if (item.tags.includes(plan.seed)) reasons.push('seed-tag');
  return reasons;
}

function newness(createdAt: Date): number {
  const age = Date.now() - createdAt.getTime();
  const days = age / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - days / 30);
}

function hybridScore(a: Item, b: Item): number {
  const ts = new TagSimilarity();
  const ps = new PopularitySimilarity(0.9);
  return ts.score(a, b) + ps.score(a, b);
}

async function collect<T extends Item>(sources: readonly CandidateSource<T>[], context: CandidateContext): Promise<readonly T[]> {
  const out: T[] = [];
  for (const source of sources) {
    const loaded = await source.load(context.tenantId);
    for (const item of loaded) {
      if (!out.some((existing) => existing.id === item.id)) {
        out.push(item);
      }
    }
  }
  return out;
}
