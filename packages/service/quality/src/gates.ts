export interface GateResult {
  name: string;
  ok: boolean;
  score: number;
  details: string;
}

export interface QualityConfig {
  minScore: number;
}

export const checkLength = (value: string, min = 5): GateResult => ({
  name: 'length',
  ok: value.length >= min,
  score: Math.min(100, Math.max(0, value.length * 4)),
  details: `len=${value.length}`,
});

export const checkCharset = (value: string): GateResult => {
  const ok = /[a-z]/i.test(value) && /\d/.test(value);
  return {
    name: 'charset',
    ok,
    score: ok ? 100 : 40,
    details: ok ? 'ok' : 'missing letters/digits',
  };
};

export const all = (value: string): GateResult[] => [checkLength(value), checkCharset(value)];

export const pass = (value: string, config: QualityConfig): boolean =>
  all(value).every((gate) => gate.ok && gate.score >= config.minScore);
