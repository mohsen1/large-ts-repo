export interface TokenMatch {
  token: string;
  score: number;
  index: number;
}

export function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export function tokenize(input: string): string[] {
  return input.toLowerCase().split(/\W+/).filter(Boolean);
}

export function matchTokens(a: string, b: string): readonly TokenMatch[] {
  const lhs = tokenize(a);
  const rhs = new Set(tokenize(b));
  const out: TokenMatch[] = [];
  for (let i = 0; i < lhs.length; i += 1) {
    const token = lhs[i];
    if (!token) continue;
    let best = 0;
    for (const other of rhs) {
      best = Math.max(best, similarity(token, other));
    }
    out.push({ token, score: best, index: i });
  }
  return out;
}

export function rank(a: string, candidates: readonly string[]): Array<{ value: string; score: number }> {
  return candidates
    .map((candidate) => ({ value: candidate, score: similarity(a, candidate) }))
    .sort((x, y) => y.score - x.score);
}
