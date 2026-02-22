import { PolicyExpr } from './ast';

export type Token =
  | { kind: 'identifier'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'punct'; value: '(' | ')' | '!' | '&' | '|' | '=' | '<' | '>' | ',' }
  | { kind: 'eof'; value: '' };

interface LexerState {
  offset: number;
  chars: string[];
}

export interface ParseResult<T> {
  value: T;
  rest: Token[];
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isDigit(ch: string): boolean {
  return /[0-9]/.test(ch);
}

function lex(expr: string): Token[] {
  const state: LexerState = { offset: 0, chars: expr.split('') };
  const tokens: Token[] = [];
  while (state.offset < state.chars.length) {
    const ch = state.chars[state.offset];
    if (isWhitespace(ch)) {
      state.offset += 1;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      const start = state.offset;
      while (state.offset < state.chars.length && /[a-zA-Z0-9_]/.test(state.chars[state.offset])) {
        state.offset += 1;
      }
      tokens.push({ kind: 'identifier', value: expr.slice(start, state.offset) });
      continue;
    }
    if (isDigit(ch)) {
      const start = state.offset;
      while (state.offset < state.chars.length && /[0-9.]/.test(state.chars[state.offset])) {
        state.offset += 1;
      }
      tokens.push({ kind: 'number', value: Number(expr.slice(start, state.offset)) });
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = state.offset + 1;
      state.offset += 1;
      while (state.offset < state.chars.length && state.chars[state.offset] !== quote) {
        state.offset += 1;
      }
      const value = expr.slice(start, state.offset);
      state.offset += 1;
      tokens.push({ kind: 'string', value });
      continue;
    }

    if ('()!&|=<>,'.includes(ch)) {
      tokens.push({ kind: 'punct', value: ch as Token['value'] });
      state.offset += 1;
      continue;
    }

    throw new Error(`unexpected token ${ch}`);
  }
  tokens.push({ kind: 'eof', value: '' });
  return tokens;
}

function parsePrimary(tokens: Token[]): ParseResult<PolicyExpr> {
  const [token, ...rest] = tokens;
  if (!token || token.kind === 'eof') {
    throw new Error('unexpected end');
  }
  if (token.kind === 'identifier') {
    if (token.value === 'true' || token.value === 'false') {
      return {
        value: { kind: 'const', value: token.value === 'true' },
        rest,
      };
    }
    return { value: { kind: 'var', name: token.value }, rest };
  }
  if (token.kind === 'string') {
    return { value: { kind: 'const', value: token.value }, rest };
  }
  if (token.kind === 'number') {
    return { value: { kind: 'const', value: token.value }, rest };
  }
  if (token.kind === 'punct' && token.value === '(') {
    const inner = parseExpression(rest);
    const next = inner.rest[0];
    if (!next || next.kind !== 'punct' || next.value !== ')') {
      throw new Error('missing )');
    }
    return { value: inner.value, rest: inner.rest.slice(1) };
  }
  throw new Error(`unexpected token ${token.kind}`);
}

function parseComparison(tokens: Token[]): ParseResult<PolicyExpr> {
  const left = parsePrimary(tokens);
  const next = left.rest[0];
  if (!next || next.kind !== 'punct' || !['=', '<', '>'].includes(next.value)) {
    return left;
  }
  if (!left) {
    throw new Error('missing lhs');
  }
  const right = parsePrimary(left.rest.slice(1));
  if (next.value === '=' && left.rest[1]?.kind === 'punct' && left.rest[1]?.value === '=') {
    return {
      value: {
        kind: 'cmp',
        op: 'eq',
        left: left.value,
        right: right.value,
      },
      rest: right.rest,
    };
  }
  const op = next.value === '>' ? 'gt' : next.value === '<' ? 'lt' : 'eq';
  return {
    value: { kind: 'cmp', op, left: left.value, right: right.value },
    rest: right.rest,
  };
}

function parseNot(tokens: Token[]): ParseResult<PolicyExpr> {
  const token = tokens[0];
  if (token?.kind === 'punct' && token.value === '!') {
    const inner = parseComparison(tokens.slice(1));
    return { value: { kind: 'not', expr: inner.value }, rest: inner.rest };
  }
  return parseComparison(tokens);
}

function parseExpression(tokens: Token[]): ParseResult<PolicyExpr> {
  let current = parseNot(tokens);
  while (true) {
    const token = current.rest[0];
    if (!token || token.kind !== 'punct' || (token.value !== '&' && token.value !== '|')) {
      return current;
    }
    const op = token.value === '&' ? 'and' : 'or';
    const rhs = parseNot(current.rest.slice(1));
    current = {
      value: {
        kind: op,
        lhs: current.value,
        rhs: rhs.value,
      },
      rest: rhs.rest,
    };
  }
}

export function parsePolicy(expression: string): PolicyExpr {
  const tree = parseExpression(lex(expression));
  if (tree.rest[0]?.kind !== 'eof') {
    throw new Error('unexpected trailing tokens');
  }
  return tree.value;
}

