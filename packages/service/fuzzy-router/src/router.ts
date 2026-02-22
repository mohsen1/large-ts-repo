import { match } from '@domain/fuzzy/matcher';

export interface SearchReq {
  term: string;
  candidates: readonly string[];
}

export interface Route {
  target: string;
  score: number;
}

export function route(req: SearchReq): Route {
  const [best] = match(req);
  return {
    target: best?.value ?? req.candidates[0] ?? '',
    score: best?.score ?? 0,
  };
}

export function routes(req: SearchReq, limit = 10): Route[] {
  return match(req)
    .slice(0, limit)
    .map((item) => ({ target: item.value, score: item.score }));
}
