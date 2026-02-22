import { DocumentVector, VectorStore } from './vector';

export interface IndexRecord {
  documentId: string;
  body: string;
  fields: Record<string, string>;
}

export interface Token {
  text: string;
  position: number;
}

export interface IndexStats {
  documents: number;
  terms: number;
  avgLen: number;
}

export class InvertedIndex implements VectorStore {
  private readonly postings = new Map<string, Set<string>>();
  private readonly vectors: Map<string, DocumentVector> = new Map();

  constructor(private readonly documents: IndexRecord[] = []) {}

  async build(records: readonly IndexRecord[]): Promise<void> {
    for (const record of records) {
      this.documents.push(record);
      for (const token of this.tokenize(record.body)) {
        const set = this.postings.get(token.text) ?? new Set();
        set.add(record.documentId);
        this.postings.set(token.text, set);
      }
    }
  }

  async upsert(items: readonly DocumentVector[]): Promise<void> {
    for (const item of items) {
      this.vectors.set(item.id, item);
    }
  }

  async search(query: Vector, topK: number): Promise<Array<{ id: string; score: number }>> {
    const entries = [...this.vectors.values()].map((vector) => ({ id: vector.id, score: 1 - distance(vector.vector, query) }));
    return entries.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  private tokenize(input: string): Token[] {
    const raw = input.toLowerCase().split(/\W+/).filter(Boolean);
    return raw.map((text, position) => ({ text, position }));
  }

  stats(): IndexStats {
    const totalLen = this.documents.reduce((acc, doc) => acc + Object.values(doc.fields).join(' ').length, 0);
    return {
      documents: this.documents.length,
      terms: this.postings.size,
      avgLen: this.documents.length === 0 ? 0 : totalLen / this.documents.length,
    };
  }
}

function distance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
