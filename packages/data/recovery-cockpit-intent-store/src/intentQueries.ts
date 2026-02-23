import { RecoveryIntent } from '@domain/recovery-cockpit-orchestration-core';
import { IntentQueryFilter } from './types';

export type IntentSearchHit = Readonly<{
  intent: RecoveryIntent;
  score: number;
  matched: ReadonlyArray<string>;
}>;

export type IntentRankProfile = Readonly<{
  keyword: string;
  matches: number;
  topScope: string;
  topZone: string;
}>;

const tokenize = (value: string): string[] => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

const containsTokens = (haystack: string, needle: readonly string[]): boolean => {
  const hay = new Set(tokenize(haystack));
  return needle.every((token) => hay.has(token));
};

export const searchIntents = (intents: readonly RecoveryIntent[], query: string): IntentSearchHit[] => {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return intents.map((intent) => ({ intent, score: 0.5, matched: [] }));
  }

  const hits = intents
    .map((intent) => {
      const fields = [intent.intentId, intent.title, intent.operator, intent.zone, ...intent.tags, ...intent.notes];
      const score = fields
        .map((field): number => (containsTokens(field, tokens) ? 1 : 0))
        .reduce((acc, isMatch) => acc + isMatch, 0 as number);
      const matched = fields.filter((field) => containsTokens(field, tokens));
      return { intent, score, matched };
    })
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score);

  return hits;
};

export const filterByQuery = (intents: readonly RecoveryIntent[], filter: IntentQueryFilter): RecoveryIntent[] =>
  intents.filter((intent) => {
    if (!filter) {
      return true;
    }
    if (filter.status && intent.status !== filter.status) {
      return false;
    }
    if (filter.scope && intent.scope !== filter.scope) {
      return false;
    }
    if (filter.zone && intent.zone !== filter.zone) {
      return false;
    }
    if (filter.operator && intent.operator !== filter.operator) {
      return false;
    }
    return true;
  });

export const rankByUrgency = (intents: readonly RecoveryIntent[]): IntentSearchHit[] => {
  const ranked = [...intents]
    .map((intent) => ({
      intent,
      score: intent.steps.length + intent.tags.length + (intent.priority === 'critical' ? 20 : intent.priority === 'high' ? 14 : intent.priority === 'medium' ? 8 : 2),
      matched: ['urgency'],
    }))
    .sort((left, right) => right.score - left.score);
  return ranked;
};

export const summarizeRankProfile = (hits: readonly IntentSearchHit[]): IntentRankProfile => {
  const top = hits[0];
  if (!top) {
    return {
      keyword: '',
      matches: 0,
      topScope: 'unknown',
      topZone: 'unknown',
    };
  }

  return {
    keyword: top.matched.join(','),
    matches: hits.length,
    topScope: top.intent.scope,
    topZone: top.intent.zone,
  };
};
