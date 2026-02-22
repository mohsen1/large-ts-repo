export type Vector = readonly number[];

export interface Embedding {
  model: string;
  dims: number;
  createdAt: Date;
}

export interface DocumentVector {
  id: string;
  documentId: string;
  vector: Vector;
  embedding: Embedding;
  metadata: Record<string, string>;
}

export interface VectorStore {
  upsert(items: readonly DocumentVector[]): Promise<void>;
  search(query: Vector, topK: number): Promise<Array<{ id: string; score: number }>>;
}

export function cosine(a: Vector, b: Vector): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

export function normalize(v: Vector): Vector {
  const norm = Math.sqrt(v.reduce((acc, value) => acc + value * value, 0));
  if (norm === 0) return v;
  return v.map((value) => value / norm);
}
