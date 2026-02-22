import { route, routes } from '@service/fuzzy-router';

export function cli(term: string, candidates: readonly string[]) {
  return {
    best: route({ term, candidates }),
    all: routes({ term, candidates }, 10),
  };
}
