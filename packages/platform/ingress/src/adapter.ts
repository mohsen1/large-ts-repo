export interface Adapter {
  canHandle(path: string): boolean;
  transform(input: unknown): unknown;
}

export class JsonAdapter implements Adapter {
  canHandle(path: string): boolean {
    return path.endsWith('.json');
  }
  transform(input: unknown): unknown {
    if (typeof input === 'string') return JSON.parse(input);
    return input;
  }
}

export class TextAdapter implements Adapter {
  canHandle(path: string): boolean {
    return path.endsWith('.txt');
  }
  transform(input: unknown): unknown {
    return String(input);
  }
}

export function detect(path: string): Adapter {
  if (path.endsWith('.json')) return new JsonAdapter();
  if (path.endsWith('.txt')) return new TextAdapter();
  return new TextAdapter();
}
