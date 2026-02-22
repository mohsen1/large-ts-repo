import { randomBytes, createHash } from 'crypto';
import { AwsClientOptions } from '@shared/aws-adapters';

export interface SecretRef {
  name: string;
  namespace: string;
}

export interface SecretValue {
  value: string;
  rotatedAt: Date;
}

export interface SecretProvider {
  get(ref: SecretRef): Promise<SecretValue | undefined>;
  put(ref: SecretRef, value: string): Promise<void>;
  rotate(ref: SecretRef): Promise<SecretValue>;
}

export function hashSecret(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export class MemorySecretProvider implements SecretProvider {
  private values = new Map<string, SecretValue>();

  async get(ref: SecretRef): Promise<SecretValue | undefined> {
    return this.values.get(key(ref));
  }

  async put(ref: SecretRef, value: string): Promise<void> {
    this.values.set(key(ref), { value, rotatedAt: new Date() });
  }

  async rotate(ref: SecretRef): Promise<SecretValue> {
    const raw = randomBytes(16).toString('hex');
    const value = hashSecret(raw);
    await this.put(ref, value);
    return (await this.get(ref))!;
  }
}

function key(ref: SecretRef): string {
  return `${ref.namespace}:${ref.name}`;
}
