export interface Item {
  id: string;
  category: string;
  tags: readonly string[];
  score: number;
  createdAt: Date;
}

export interface Similarity {
  score(a: Item, b: Item): number;
}

export interface CandidateSource<T extends Item = Item> {
  load(profileId: string): Promise<readonly T[]>;
}

export interface CandidateContext {
  tenantId: string;
  locale: string;
  experiment?: string;
}

export interface CandidatePool<T extends Item = Item> {
  candidates: readonly T[];
  context: CandidateContext;
  features: Record<string, number>;
}

export interface Recommendation<T extends Item = Item> {
  itemId: string;
  score: number;
  reasons: string[];
  rank: number;
  payload: T;
}

export interface RecommendationPlan {
  topK: number;
  dampening: number;
  boostNew: number;
  seed: string;
}
