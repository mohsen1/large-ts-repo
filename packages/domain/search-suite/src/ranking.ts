import { IndexStats, InvertedIndex } from './indexer';

export interface RankingSignal {
  boosts: Record<string, number>;
  recencyMs: number;
  quality: number;
}

export interface RankInput { rank: number; score: number; recency: number; quality: number; }

export function rank(values: ReadonlyArray<RankInput>): number {
  return values.reduce((acc, item) => acc + item.score * item.rank + item.quality - item.recency, 0);
}

export function recencyBoost(nowMs: number, atMs: number): number {
  const age = Math.max(nowMs - atMs, 0);
  const day = 24 * 3600 * 1000;
  return Math.max(0, Math.exp(-age / (7 * day)));
}

export async function score(index: InvertedIndex, docs: readonly string[], qualityBoosts: readonly number[]): Promise<Array<{ id: string; score: number }>> {
  const stats: IndexStats = index.stats();
  const out: Array<{ id: string; score: number }> = [];
  for (const doc of docs) {
    const quality = qualityBoosts[0] ?? 1;
    const recency = recencyBoost(Date.now(), Date.now() - 12_000);
    const base = Math.log1p(stats.documents);
    out.push({ id: doc, score: base * quality + recency * 0.1 });
  }
  return out;
}
