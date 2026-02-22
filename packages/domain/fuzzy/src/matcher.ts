import { cosineDistance, vectorize } from './vector';
import { matchTokens, rank, similarity } from './string';

export interface MatchInput {
  term: string;
  candidates: readonly string[];
}

export interface MatchResult {
  value: string;
  score: number;
  reason: string;
}

export function match(input: MatchInput): MatchResult[] {
  const byToken = matchTokens(input.term, input.candidates.join(' '));
  const byVector = input.candidates
    .map((candidate) => ({
      value: candidate,
      score: cosineDistance(vectorize(input.term), vectorize(candidate)),
    }))
    .sort((a, b) => b.score - a.score);

  const byString = rank(input.term, input.candidates);

  const scores = new Map<string, number>();
  for (const current of byString) scores.set(current.value, current.score * 0.7);
  for (const current of byToken) {
    const existing = scores.get(current.token);
    scores.set(current.token, Math.max(existing ?? 0, current.score * 0.3));
  }
  for (const hit of byVector) {
    scores.set(hit.value, (scores.get(hit.value) ?? 0) + hit.score * 0.4);
  }

  const merged = [...scores.entries()]
    .map(([value, score]) => ({ value, score }))
    .sort((a, b) => b.score - a.score);

  return merged.map((item, i) => ({
    value: item.value,
    score: item.score,
    reason: i === 0 ? 'best' : `rank-${i + 1}`,
  }));
}
